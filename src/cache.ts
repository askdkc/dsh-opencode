/**
 * Durable cache of validated catalog source payloads.
 *
 * The cache stores the *inputs* — official id lists and the two Models.dev
 * provider slices — never normalized output and never secrets. Restoring
 * re-runs the current normalizer over the stored inputs, so a normalizer fix
 * benefits a stored cache, and a stored cache from a foreign schema or
 * normalizer version is refused wholesale.
 *
 * Writes are locked and atomic: two processes sharing one profile never
 * observe a torn file, and a crash mid-write leaves the previous file intact.
 *
 * @module opencode-live/cache
 */

import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { OfficialList, Product } from './normalize.ts'
import type { SourceState } from './snapshot.ts'

/** Bump when the stored shape changes incompatibly. */
export const CACHE_SCHEMA_VERSION = 1
/** Bump when a normalizer change would make stored inputs normalize differently. */
export const CACHE_NORMALIZER_VERSION = 1

/** One cached official list with its freshness facts. */
export interface CachedOfficialList {
  readonly state: SourceState
  readonly fetchedAt: number
  readonly ids: readonly string[]
}

/** One cached Models.dev slice with its freshness facts. */
export interface CachedModelsDev {
  readonly state: SourceState
  readonly fetchedAt: number
  /** Raw validated provider slices keyed by Models.dev provider id. */
  readonly providers: Readonly<Record<string, Record<string, unknown>>>
}

/** What a valid cache load returns. */
export interface CachedSources {
  zenList?: CachedOfficialList
  goList?: CachedOfficialList
  modelsDev?: CachedModelsDev
}

interface CacheFileV1 {
  version: 1
  normalizer: 1
  savedAt: number
  sources: {
    'zen-list'?: CachedOfficialList
    'go-list'?: CachedOfficialList
    'models-dev'?: CachedModelsDev
  }
}

/** Whether one stored source state carries only the bounded display facts. */
function isSourceState(value: unknown): value is SourceState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return [...Object.values(record)].every(member => typeof member === 'string' || typeof member === 'number')
    && Object.keys(record).every(key => [
      'lastCheckedAt', 'lastSuccessfulAt', 'etag', 'lastErrorCode', 'lastErrorMessage',
    ].includes(key))
}

/** Whether one stored official list is structurally valid. */
function isCachedOfficialList(value: unknown): value is CachedOfficialList {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return isSourceState(record.state)
    && typeof record.fetchedAt === 'number' && Number.isFinite(record.fetchedAt)
    && Array.isArray(record.ids)
    && record.ids.every(id => typeof id === 'string' && id.length > 0)
}

/** Whether one stored Models.dev slice is structurally valid. */
function isCachedModelsDev(value: unknown): value is CachedModelsDev {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (!isSourceState(record.state)
    || typeof record.fetchedAt !== 'number' || !Number.isFinite(record.fetchedAt)
    || typeof record.providers !== 'object' || record.providers === null) return false
  return Object.values(record.providers).every(provider =>
    typeof provider === 'object' && provider !== null
    && typeof (provider as Record<string, unknown>).models === 'object')
}

/**
 * Load and validate the cache file. Any structural defect — wrong version,
 * wrong normalizer, malformed source entry — refuses the whole file rather
 * than trusting a partial restore.
 * @param path - the cache file path.
 * @returns the cached sources, or `undefined` when absent or invalid.
 */
export async function loadCache(path: string): Promise<CachedSources | undefined> {
  let raw: unknown
  try {
    const { readFile } = await import('node:fs/promises')
    raw = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const file = raw as Record<string, unknown>
  if (file.version !== CACHE_SCHEMA_VERSION || file.normalizer !== CACHE_NORMALIZER_VERSION) return undefined
  if (typeof file.savedAt !== 'number' || !Number.isFinite(file.savedAt)) return undefined
  if (typeof file.sources !== 'object' || file.sources === null) return undefined
  const sources = file.sources as Record<string, unknown>
  const cached: CachedSources = {}
  if (isCachedOfficialList(sources['zen-list'])) cached.zenList = sources['zen-list']
  if (isCachedOfficialList(sources['go-list'])) cached.goList = sources['go-list']
  if (isCachedModelsDev(sources['models-dev'])) cached.modelsDev = sources['models-dev']
  if (cached.zenList === undefined && cached.goList === undefined && cached.modelsDev === undefined) {
    return undefined
  }
  return cached
}

/** The payload one save persists. */
export interface CacheSavePayload {
  readonly zenList?: { readonly state: SourceState; readonly ids: readonly string[] }
  readonly goList?: { readonly state: SourceState; readonly ids: readonly string[] }
  readonly modelsDev?: { readonly state: SourceState; readonly providers: Readonly<Record<string, Record<string, unknown>>> }
}

/**
 * Persist the payload under a file lock and an atomic replacement, merging
 * per source so a slower writer can never erase a fresher entry another
 * completion already stored: each source keeps whichever entry — the stored
 * one or the incoming one — validated more recently, and a source the caller
 * does not name leaves the stored entry untouched.
 *
 * A write failure is reported to the caller — the in-memory catalog stays
 * usable — and the caller decides what the loss means for later restarts.
 * @param path - the cache file path.
 * @param payload - the validated source payloads to store.
 * @param savedAt - the wall-clock stamp for the entry.
 */
export async function saveCache(path: string, payload: CacheSavePayload, savedAt: number): Promise<void> {
  const incoming = buildFile(payload, savedAt)
  await withFileLock(path, async () => {
    const existing = await readCacheFile(path)
    const merged = existing === undefined ? incoming : mergeFiles(existing, incoming)
    await writeFileAtomic(path, JSON.stringify(merged), { mode: 0o600, dirMode: 0o700 })
  })
}

/** Assemble one cache file image from a payload. */
function buildFile(payload: CacheSavePayload, savedAt: number): CacheFileV1 {
  return {
    version: 1,
    normalizer: 1,
    savedAt,
    sources: {
      ...payload.zenList === undefined ? {} : {
        'zen-list': { state: payload.zenList.state, fetchedAt: savedAt, ids: payload.zenList.ids },
      },
      ...payload.goList === undefined ? {} : {
        'go-list': { state: payload.goList.state, fetchedAt: savedAt, ids: payload.goList.ids },
      },
      ...payload.modelsDev === undefined ? {} : {
        'models-dev': { state: payload.modelsDev.state, fetchedAt: savedAt, providers: payload.modelsDev.providers },
      },
    },
  }
}

/** The success stamp ordering one merge decision. */
function successAt(entry: { state: SourceState }): number {
  return entry.state.lastSuccessfulAt ?? -1
}

/**
 * Merge two cache file images per source: the entry whose source confirmed
 * more recently wins; an equally fresh entry is taken from the incoming file
 * because its state carries the most recent check outcome. Sources absent
 * from the incoming image keep the stored entry, which is what stops a
 * partial or failed refresh from erasing another source's data.
 */
function mergeFiles(existing: CacheFileV1, incoming: CacheFileV1): CacheFileV1 {
  const sources: CacheFileV1['sources'] = {}
  // The per-key assignment happens through one loosely typed view: each key
  // carries a different entry shape, and the union is decided per key below.
  const target = sources as Record<string, CachedOfficialList | CachedModelsDev>
  for (const key of ['zen-list', 'go-list', 'models-dev'] as const) {
    const prior = existing.sources[key]
    const next = incoming.sources[key]
    if (next === undefined && prior === undefined) continue
    if (next === undefined) {
      target[key] = prior as CachedOfficialList | CachedModelsDev
      continue
    }
    if (prior === undefined || successAt(next) >= successAt(prior)) {
      target[key] = next
      continue
    }
    target[key] = prior
  }
  return {
    version: incoming.version,
    normalizer: incoming.normalizer,
    savedAt: Math.max(incoming.savedAt, existing.savedAt),
    sources,
  }
}

/** Read and parse the cache file without validation judgment. */
async function readCacheFile(path: string): Promise<CacheFileV1 | undefined> {
  try {
    const { readFile } = await import('node:fs/promises')
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (typeof raw !== 'object' || raw === null) return undefined
    const file = raw as Record<string, unknown>
    if (file.version !== CACHE_SCHEMA_VERSION || file.normalizer !== CACHE_NORMALIZER_VERSION) return undefined
    if (typeof file.savedAt !== 'number' || !Number.isFinite(file.savedAt)) return undefined
    if (typeof file.sources !== 'object' || file.sources === null) return undefined
    return file as unknown as CacheFileV1
  } catch {
    return undefined
  }
}

/**
 * Rebuild a validated official list from stored ids. The ids were validated
 * when fetched; restoring keeps them exact.
 * @param product - which product's list this is (used only by the caller).
 * @param cached - the stored entry.
 * @returns the official list shape the normalizer consumes.
 */
export function restoreOfficialList(_product: Product, cached: CachedOfficialList): OfficialList {
  const models = new Map<string, { id: string }>()
  for (const id of cached.ids) models.set(id, { id })
  return { models }
}
