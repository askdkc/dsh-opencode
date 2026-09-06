/**
 * Catalog fetching and refresh arbitration.
 *
 * One manager owns the three public sources (the official Zen list, the
 * official Go list, and the shared Models.dev metadata), runs every fetch
 * single-flight per source, keeps per-source freshness facts, publishes
 * immutable snapshots through the normalizer, and persists validated source
 * payloads to the cache.
 *
 * Failure semantics follow the design: an empty official list is an anomaly
 * that keeps the previous set; a failed source never deletes anything; a
 * failure for one product never blocks the other product's refresh; and a
 * 304 counts as a successful revalidation.
 *
 * @module opencode-live/catalog
 */

import type {
  MetadataProvider,
  OfficialList,
  Product,
} from './normalize.ts'
import {
  METADATA_PROVIDER_GO,
  METADATA_PROVIDER_ZEN,
  SOURCES,
  joinProduct,
  parseMetadataProvider,
  parseOfficialList,
} from './normalize.ts'
import { loadCache, restoreOfficialList, saveCache } from './cache.ts'
import type { CatalogSnapshot, SourceState, SourceStates } from './snapshot.ts'
import { buildSnapshot } from './snapshot.ts'

/** Minimal HTTP surface the manager needs; injectable for tests. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/** Resolved catalog configuration after validation. */
export interface CatalogConfig {
  readonly refreshIntervalMs: number
  readonly listRevalidateAfterMs: number
  readonly timeoutMs: number
  readonly maxStaleMs: number
  readonly requireFresh: boolean
  readonly cachePath?: string
}

/** How long one source's decoded body may grow before the read is cut off. */
const OFFICIAL_LIST_MAX_BYTES = 1024 * 1024
const MODELS_DEV_MAX_BYTES = 32 * 1024 * 1024
/** Small delay jitter ratio for periodic refresh (multi-profile thundering herd). */
const REFRESH_JITTER_RATIO = 0.1
/** Maximum retained length for one diagnostic message. */
const MAX_MESSAGE_CHARS = 300

/** The outcome of one source fetch attempt. */
type SourceFetchOutcome =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'official'; readonly list: OfficialList; readonly etag?: string }
  | { readonly kind: 'metadata'; readonly providers: ReadonlyMap<string, MetadataProvider>; readonly etag?: string }
  | { readonly kind: 'failed'; readonly code: string; readonly message: string }

/** Internal per-source runtime state (mutable working copy behind the frozen views). */
interface SourceRuntime {
  state: SourceState
  /** Last validated payloads, kept in memory so a 304 restores them. */
  official?: OfficialList
  providers?: ReadonlyMap<string, MetadataProvider>
  /** Raw Models.dev provider slices for the cache. */
  rawProviders?: Record<string, Record<string, unknown>>
}

/** Options for constructing a CatalogManager. */
export interface CatalogManagerOptions {
  readonly config: CatalogConfig
  /** HTTP entry point; defaults to global fetch. */
  readonly fetch?: FetchLike
  /** Wall clock; injectable for tests. */
  readonly now?: () => number
  /** Called after every publish, synchronously, with the new snapshot. */
  readonly onChange?: (snapshot: CatalogSnapshot) => void
  /** Warning sink; defaults to dropping warnings. */
  readonly warn?: (message: string) => void
}

/** A bounded wait that resolves when the first official list lands. */
export interface InitialWaitResult {
  readonly gotData: boolean
}

/**
 * The catalog manager. Construct, `start()`, and `stop()` with the plugin
 * fiber; every other method is safe from any async context but must not be
 * called after `stop()`.
 */
export class CatalogManager {
  private readonly fetchImpl: FetchLike
  private readonly now: () => number
  private readonly onChange: ((snapshot: CatalogSnapshot) => void) | undefined
  private readonly warn: (message: string) => void

  private configValue: CatalogConfig
  private readonly sources: Map<'zen-list' | 'go-list' | 'models-dev', SourceRuntime> = new Map()
  private snapshot: CatalogSnapshot | undefined
  private inFlight: Map<string, Promise<void>> = new Map()
  private timer: NodeJS.Timeout | undefined
  private lifecycle = new AbortController()
  private disposed = false
  private firstListResolve: (() => void) | undefined

  constructor(options: CatalogManagerOptions) {
    this.configValue = options.config
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init))
    this.now = options.now ?? (() => Date.now())
    this.onChange = options.onChange
    this.warn = options.warn ?? (() => {})
    this.sources.set('zen-list', { state: {} })
    this.sources.set('go-list', { state: {} })
    this.sources.set('models-dev', { state: {} })
  }

  /** The active catalog configuration. */
  private get config(): CatalogConfig {
    return this.configValue
  }

  /** The currently published snapshot, if one has been built. */
  get current(): CatalogSnapshot | undefined {
    return this.snapshot
  }

  /**
   * Restore cached source payloads (if valid), publish an initial snapshot,
   * run the first refresh to completion, and arm the periodic timer.
   * The composition never awaits this; tests do, for determinism.
   */
  async start(): Promise<void> {
    if (this.disposed) return
    await this.restoreFromCache()
    this.publish()
    await this.refresh()
    if (this.disposed) return
    this.scheduleNextRefresh()
  }

  /**
   * Stop timers, abort in-flight fetches, and refuse every late completion:
   * a disposed manager never publishes, saves, or re-arms.
   */
  stop(): void {
    this.disposed = true
    this.lifecycle.abort()
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.inFlight.clear()
  }

  /** Apply new catalog configuration values; re-arms the periodic timer. */
  reconfigure(config: CatalogConfig): void {
    if (this.disposed) return
    this.configValue = { ...config }
    this.scheduleNextRefresh()
  }

  /**
   * Refresh the given products' sources (all when omitted). Concurrent calls
   * coalesce per source: a fetch already in flight is joined, not repeated.
   * `force` bypasses nothing here — single-flight is the TTL — the caller
   * uses the flag only to skip its own TTL checks.
   * @param options - which products to cover and a cancellation signal.
   */
  async refresh(options: { products?: readonly Product[]; signal?: AbortSignal } = {}): Promise<void> {
    if (this.disposed) return
    const products = options.products ?? ['zen', 'go']
    const wantsZen = products.includes('zen')
    const wantsGo = products.includes('go')
    const tasks: Array<Promise<void>> = []
    if (wantsZen) tasks.push(this.singleFlight('zen', 'zen-list', options.signal))
    if (wantsGo) tasks.push(this.singleFlight('go', 'go-list', options.signal))
    // One shared Models.dev fetch serves both products.
    if (wantsZen || wantsGo) tasks.push(this.singleFlight('both', 'models-dev', options.signal))
    await Promise.all(tasks)
  }

  /**
   * Force one refresh for a product and wait for it, joining any fetch that
   * is already running. Used by the unknown-model path; the "once" budget is
   * the caller's to enforce per selection attempt.
   * @param product - the product whose sources must refresh.
   */
  async forceRefreshOnce(product: Product): Promise<void> {
    await this.refresh({ products: [product] })
  }

  /**
   * Bounded wait for the first usable data. Resolves immediately when any
   * source has ever validated (including a restored cache); otherwise waits
   * up to `timeoutMs` for the in-flight first refresh.
   * @param timeoutMs - the wait bound.
   * @returns whether any data is available when the wait ends.
   */
  async ensureInitial(timeoutMs: number): Promise<InitialWaitResult> {
    if (this.hasAnySuccess()) return { gotData: true }
    if (this.disposed) return { gotData: false }
    const waited = await new Promise<boolean>((resolve) => {
      let settled = false
      const done = (value: boolean): void => {
        if (settled) return
        settled = true
        this.firstListResolve = undefined
        clearTimeout(handle)
        resolve(value)
      }
      this.firstListResolve = () => done(true)
      const handle = setTimeout(() => done(false), timeoutMs)
      if (this.hasAnySuccess()) done(true)
    })
    return { gotData: waited }
  }

  /**
   * Trigger a background revalidation of one product's official list when the
   * last check is older than the revalidation TTL. Non-blocking: selection
   * latency must not depend on a network round trip.
   * @param product - the product whose list is being displayed or selected.
   */
  revalidateIfNeeded(product: Product): void {
    if (this.disposed) return
    const state = this.sources.get(product === 'zen' ? 'zen-list' : 'go-list')?.state
    const lastCheckedAt = state?.lastCheckedAt
    if (lastCheckedAt !== undefined && this.now() - lastCheckedAt < this.config.listRevalidateAfterMs) return
    void this.refresh({ products: [product] }).catch(() => {})
  }

  /** Whether any source has ever validated for this instance. */
  private hasAnySuccess(): boolean {
    for (const source of this.sources.values()) {
      if (source.state.lastSuccessfulAt !== undefined) return true
    }
    return false
  }

  /** Single-flight wrapper: one running fetch per source key. */
  private singleFlight(scope: 'zen' | 'go' | 'both', sourceId: 'zen-list' | 'go-list' | 'models-dev', signal?: AbortSignal): Promise<void> {
    const running = this.inFlight.get(sourceId)
    if (running !== undefined) {
      return running
    }
    const task = this.runFetch(scope, sourceId, signal)
      .catch((error: unknown) => {
        if (!this.disposed) {
          this.warn(`opencode-live: refreshing "${sourceId}" failed unexpectedly: ${describeError(error)}`)
        }
      })
      .finally(() => {
        if (this.inFlight.get(sourceId) === task) this.inFlight.delete(sourceId)
      })
    this.inFlight.set(sourceId, task)
    return task
  }

  /** Fetch one source, update its runtime state, and publish. */
  private async runFetch(scope: 'zen' | 'go' | 'both', sourceId: 'zen-list' | 'go-list' | 'models-dev', signal?: AbortSignal): Promise<void> {
    const source = this.sources.get(sourceId)
    if (source === undefined) return
    const startedAt = this.now()
    source.state = { ...source.state, lastCheckedAt: startedAt }
    const outcome = await this.fetchSource(sourceId, source, signal)
    if (this.disposed) return

    if (outcome.kind === 'failed') {
      source.state = {
        ...source.state,
        lastErrorCode: outcome.code,
        lastErrorMessage: outcome.message.slice(0, MAX_MESSAGE_CHARS),
      }
    } else {
      const { lastErrorCode: _code, lastErrorMessage: _message, ...prior } = source.state
      source.state = {
        ...prior,
        lastSuccessfulAt: this.now(),
        ...'etag' in outcome && outcome.etag !== undefined ? { etag: outcome.etag } : {},
      }
      if (outcome.kind === 'official') source.official = outcome.list
      if (outcome.kind === 'metadata') {
        source.providers = outcome.providers
        source.rawProviders = collectRawProviders(outcome.providers)
      }
      if (sourceId !== 'models-dev') this.firstListResolve?.()
    }

    // Partial failure tolerance: every completed source immediately
    // re-joins with whatever the other sources currently hold.
    this.publish()
    await this.persistCache(sourceId)
  }

  /** Perform the HTTP fetch and payload validation for one source. */
  private async fetchSource(
    sourceId: 'zen-list' | 'go-list' | 'models-dev',
    source: SourceRuntime,
    signal?: AbortSignal,
  ): Promise<SourceFetchOutcome> {
    const isMetadata = sourceId === 'models-dev'
    const url = isMetadata
      ? SOURCES.metadataUrl
      : sourceId === 'zen-list' ? SOURCES.zen.modelsUrl : SOURCES.go.modelsUrl
    const headers: Record<string, string> = {}
    if (source.state.etag !== undefined) headers['if-none-match'] = source.state.etag
    const maxBytes = isMetadata ? MODELS_DEV_MAX_BYTES : OFFICIAL_LIST_MAX_BYTES
    const controller = new AbortController()
    const abort = (): void => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    this.lifecycle.signal.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(abort, this.config.timeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'error',
      })
      if (response.status === 304) return { kind: 'unchanged' }
      if (!response.ok) {
        return { kind: 'failed', code: 'HTTP_STATUS', message: `GET ${url} answered HTTP ${response.status}` }
      }
      const body = await readBoundedBody(response, maxBytes)
      let parsed: unknown
      try {
        parsed = JSON.parse(new TextDecoder().decode(body))
      } catch {
        return { kind: 'failed', code: 'INVALID_JSON', message: `GET ${url} returned a body that is not JSON` }
      }
      if (isMetadata) {
        const providers = new Map<string, MetadataProvider>()
        for (const providerId of [METADATA_PROVIDER_ZEN, METADATA_PROVIDER_GO]) {
          const parsedProvider = parseMetadataProvider(parsed, providerId)
          if (!parsedProvider.ok) {
            return { kind: 'failed', code: parsedProvider.code, message: `models.dev slice "${providerId}": ${parsedProvider.message}` }
          }
          providers.set(providerId, parsedProvider.value)
        }
        return { kind: 'metadata', providers, ...readEtag(response) }
      }
      const parsedList = parseOfficialList(parsed)
      if (!parsedList.ok) {
        return { kind: 'failed', code: parsedList.code, message: `${url}: ${parsedList.message}` }
      }
      // An empty list is not deletions: it is an anomaly the caller keeps.
      if (parsedList.value.models.size === 0) {
        return { kind: 'failed', code: 'EMPTY_LIST', message: `${url} listed zero models` }
      }
      return { kind: 'official', list: parsedList.value, ...readEtag(response) }
    } catch (error: unknown) {
      if (signal?.aborted) return { kind: 'failed', code: 'ABORTED', message: 'caller cancelled the refresh' }
      if (this.disposed) return { kind: 'failed', code: 'ABORTED', message: 'plugin unloaded during refresh' }
      if (controller.signal.aborted) {
        return { kind: 'failed', code: 'TIMEOUT', message: `GET ${url} exceeded ${this.config.timeoutMs}ms` }
      }
      if ((error as { code?: unknown } | null)?.code === 'TOO_LARGE') {
        return { kind: 'failed', code: 'TOO_LARGE', message: `GET ${url} body exceeded the ${maxBytes}-byte limit` }
      }
      return { kind: 'failed', code: 'NETWORK', message: `GET ${url} failed: ${describeError(error)}` }
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  }

  /** Publish the current join over every source's best available data. */
  private publish(): void {
    const now = this.now()
    const states: SourceStates = new Map([
      ['zen-list', Object.freeze({ ...this.sources.get('zen-list')?.state })],
      ['go-list', Object.freeze({ ...this.sources.get('go-list')?.state })],
      ['models-dev', Object.freeze({ ...this.sources.get('models-dev')?.state })],
    ])
    const previous = this.snapshot
    const products = {
      zen: joinProduct('zen', {
        official: this.officialInput('zen-list'),
        metadata: this.metadataInput(METADATA_PROVIDER_ZEN),
        previousOfficialIds: previousOfficialIds(previous, 'zen'),
      }),
      go: joinProduct('go', {
        official: this.officialInput('go-list'),
        metadata: this.metadataInput(METADATA_PROVIDER_GO),
        previousOfficialIds: previousOfficialIds(previous, 'go'),
      }),
    }
    this.snapshot = buildSnapshot(previous, { products, sources: states, maxStaleMs: this.config.maxStaleMs, now })
    this.onChange?.(this.snapshot)
  }

  /** The official-list join input for one product, if any was ever validated. */
  private officialInput(sourceId: 'zen-list' | 'go-list'): { list: OfficialList; checkedAt?: number; successfulAt?: number } | undefined {
    const source = this.sources.get(sourceId)
    if (source === undefined || source.official === undefined) return undefined
    return {
      list: source.official,
      ...source.state.lastCheckedAt !== undefined ? { checkedAt: source.state.lastCheckedAt } : {},
      ...source.state.lastSuccessfulAt !== undefined ? { successfulAt: source.state.lastSuccessfulAt } : {},
    }
  }

  /** The metadata join input for one Models.dev provider, if ever validated. */
  private metadataInput(providerId: string): { provider: MetadataProvider; checkedAt?: number; successfulAt?: number } | undefined {
    const source = this.sources.get('models-dev')
    const provider = source?.providers?.get(providerId)
    if (source === undefined || provider === undefined) return undefined
    return {
      provider,
      ...source.state.lastCheckedAt !== undefined ? { checkedAt: source.state.lastCheckedAt } : {},
      ...source.state.lastSuccessfulAt !== undefined ? { successfulAt: source.state.lastSuccessfulAt } : {},
    }
  }

  /** Persist the source that just completed; failures never block the catalog. */
  private async persistCache(sourceId: 'zen-list' | 'go-list' | 'models-dev'): Promise<void> {
    const path = this.config.cachePath
    if (path === undefined || this.disposed) return
    const zen = this.sources.get('zen-list')
    const go = this.sources.get('go-list')
    const metadata = this.sources.get('models-dev')
    try {
      await saveCache(path, {
        ...zen?.official !== undefined ? {
          zenList: { state: zen.state, ids: [...zen.official.models.keys()] },
        } : {},
        ...go?.official !== undefined ? {
          goList: { state: go.state, ids: [...go.official.models.keys()] },
        } : {},
        ...metadata?.providers !== undefined && metadata.rawProviders !== undefined ? {
          modelsDev: { state: metadata.state, providers: metadata.rawProviders },
        } : {},
      }, this.now())
    } catch (error: unknown) {
      this.warn(`opencode-live: saving the catalog cache failed: ${describeError(error)}`)
    }
    void sourceId
  }

  /** Restore cached source payloads and their freshness facts. */
  private async restoreFromCache(): Promise<void> {
    const path = this.config.cachePath
    if (path === undefined) return
    const cached = await loadCache(path)
    if (cached === undefined || this.disposed) return
    if (cached.zenList !== undefined) {
      const zen = this.sources.get('zen-list')
      if (zen !== undefined) {
        zen.official = restoreOfficialList('zen', cached.zenList)
        zen.state = { ...cached.zenList.state }
      }
    }
    if (cached.goList !== undefined) {
      const go = this.sources.get('go-list')
      if (go !== undefined) {
        go.official = restoreOfficialList('go', cached.goList)
        go.state = { ...cached.goList.state }
      }
    }
    if (cached.modelsDev !== undefined) {
      const metadata = this.sources.get('models-dev')
      if (metadata !== undefined) {
        const providers = new Map<string, MetadataProvider>()
        for (const providerId of [METADATA_PROVIDER_ZEN, METADATA_PROVIDER_GO]) {
          const raw = cached.modelsDev.providers[providerId]
          if (raw === undefined) continue
          const parsed = parseMetadataProvider({ [providerId]: raw }, providerId)
          if (parsed.ok) providers.set(providerId, parsed.value)
        }
        if (providers.size > 0) {
          metadata.providers = providers
          metadata.rawProviders = { ...cached.modelsDev.providers }
          metadata.state = { ...cached.modelsDev.state }
        }
      }
    }
  }

  /** Arm the next periodic refresh with jitter. */
  private scheduleNextRefresh(): void {
    if (this.disposed) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    const base = this.config.refreshIntervalMs
    const jitter = base * REFRESH_JITTER_RATIO * Math.random()
    this.timer = setTimeout(() => {
      if (this.disposed) return
      void this.refresh().catch(() => {})
      this.scheduleNextRefresh()
    }, Math.min(base + jitter, Number.MAX_SAFE_INTEGER))
  }
}

/** Read the response's ETag header when present. */
function readEtag(response: Response): { etag?: string } {
  const etag = response.headers.get('etag')
  return etag !== null && etag.length > 0 ? { etag } : {}
}

/**
 * Read a response body with a hard cap on decoded bytes. Content-Length is
 * advisory (it sizes the compressed body); the real budget applies to what
 * this process actually reads.
 */
async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null) {
    const declared = Number(contentLength)
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw Object.assign(new Error(`body exceeds ${maxBytes} bytes`), { code: 'TOO_LARGE' })
    }
  }
  const body = response.body
  if (body === null) throw Object.assign(new Error('empty response body'), { code: 'EMPTY_BODY' })
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw Object.assign(new Error(`body exceeds ${maxBytes} decoded bytes`), { code: 'TOO_LARGE' })
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

/** The ids a previous snapshot confirmed against one product's official list. */
function previousOfficialIds(snapshot: CatalogSnapshot | undefined, product: Product): ReadonlySet<string> {
  const ids = new Set<string>()
  const view = snapshot?.products[product]
  if (view === undefined) return ids
  for (const candidate of view.candidates.values()) {
    if (candidate.state !== 'catalog-only' && candidate.state !== 'removed') ids.add(candidate.id)
  }
  return ids
}

/** Extract raw provider slices for cache storage. */
function collectRawProviders(providers: ReadonlyMap<string, MetadataProvider>): Record<string, Record<string, unknown>> {
  // The validated MetadataProvider has already dropped everything unknown;
  // persist exactly the validated slice, re-shaped the way it was read.
  const raw: Record<string, Record<string, unknown>> = {}
  for (const [id, provider] of providers) {
    const models: Record<string, unknown> = {}
    for (const [modelId, model] of provider.models) {
      models[modelId] = {
        ...model.name === undefined ? {} : { name: model.name },
        ...model.contextWindow === undefined ? {} : { limit: { context: model.contextWindow, ...model.maxOutputTokens === undefined ? {} : { output: model.maxOutputTokens } } },
        ...model.input === undefined ? {} : { modalities: { input: [...model.input] } },
        ...model.tools === 'unknown' ? {} : { tool_call: model.tools },
        ...model.reasoning === 'unknown' ? {} : { reasoning: model.reasoning },
        ...model.reasoningEfforts === undefined ? {} : { reasoning_options: [{ type: 'effort', values: [...model.reasoningEfforts] }] },
        ...model.cost === undefined ? {} : { cost: model.cost },
        ...model.npm === undefined ? {} : { provider: { npm: model.npm } },
      }
    }
    raw[id] = { ...provider.npm === undefined ? {} : { npm: provider.npm }, models }
  }
  return raw
}

/** One-line safe description of an unknown error. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
