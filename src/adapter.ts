/**
 * The live OpenCode adapter: catalog awareness on top of the public
 * `PiAiAdapter`.
 *
 * Message conversion, streaming, tool calls, images, replay state, usage,
 * cancellation, and idle timeouts stay entirely delegated. This subclass adds
 * only what a dynamic catalog requires: waiting for the first catalog data,
 * revalidating on display, forcing one refresh for an unknown model, refusing
 * non-ready or stale candidates with their reason, and refusing tool-bearing
 * requests on models known not to support tools.
 *
 * Every refusal names the candidate state; nothing is silently dropped and no
 * model is substituted.
 *
 * @module opencode-live/adapter
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmResolvedModelInfo,
  PreparedAdapterCall,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiAdapterOptions } from '@deepseek-ai/dsh-llm-pi-ai'
import type { CatalogManager } from './catalog.ts'
import type { CatalogModel, Product } from './normalize.ts'
import { PRODUCT_BY_ROUTE } from './normalize.ts'
import { describeNonReadyState } from './normalize.ts'

/** Constructor options for {@link LiveOpenCodeAdapter}. */
export interface LiveOpenCodeAdapterOptions extends PiAiAdapterOptions {
  /** The catalog manager publishing immutable snapshots. */
  catalog: CatalogManager
  /** Bound on how long the first model listing waits for catalog data. */
  initialWaitMs: number
  /** Whether requests must refuse a stale official list. */
  requireFresh: boolean
}

/**
 * pi-ai-backed adapter over the two live OpenCode routes.
 *
 * Each operation reads the current catalog snapshot, so a published catalog
 * change reaches the next request; a prepared call keeps the snapshot its
 * generation captured, because the stream it returns is bound to that
 * generation's provider.
 */
export class LiveOpenCodeAdapter extends PiAiAdapter {
  private readonly catalog: CatalogManager
  private initialWaitMs: number
  private requireFresh: boolean

  constructor(options: LiveOpenCodeAdapterOptions) {
    super(options)
    this.catalog = options.catalog
    this.initialWaitMs = options.initialWaitMs
    this.requireFresh = options.requireFresh
  }

  /** Apply updated catalog-related settings without re-registering. */
  updateOptions(options: { initialWaitMs: number; requireFresh: boolean }): void {
    this.initialWaitMs = options.initialWaitMs
    this.requireFresh = options.requireFresh
  }

  /** The product behind one owned route, or the not-owned failure. */
  private productOf(provider: string): Product {
    const product = PRODUCT_BY_ROUTE[provider as keyof typeof PRODUCT_BY_ROUTE]
    if (product === undefined) {
      throw new LlmError(`opencode-live: adapter does not own provider "${provider}"`, 'NO_ADAPTER')
    }
    return product
  }

  /** The candidate for one route/model pair in the current snapshot. */
  private candidateOf(provider: string, model: string): CatalogModel | undefined {
    const snapshot = this.catalog.current
    if (snapshot === undefined) return undefined
    return snapshot.products[this.productOf(provider)].candidates.get(model)
  }

  /**
   * Make one route/model pair selectable: wait for initial data, revalidate
   * the list if its TTL expired, and force exactly one refresh for an unknown
   * id before refusing with the candidate's state.
   * @param provider - the route the request names.
   * @param model - the exact model id the request names.
   */
  private async ensureSelectable(provider: string, model: string): Promise<void> {
    const product = this.productOf(provider)
    await this.catalog.ensureInitial(this.initialWaitMs)
    this.catalog.revalidateIfNeeded(product)
    let candidate = this.candidateOf(provider, model)
    if (candidate === undefined) {
      // One forced refresh per selection attempt; coalesced with any fetch
      // already in flight. Repeated attempts against a genuinely absent id
      // do not keep the network busy.
      await this.catalog.forceRefreshOnce(product)
      candidate = this.candidateOf(provider, model)
    }
    if (candidate === undefined) {
      throw new LlmError(
        `opencode-live: product "${product}" has no model "${model}" in the current catalog`,
        'UNKNOWN_MODEL',
      )
    }
    if (candidate.state !== 'ready') {
      throw new LlmError(
        `opencode-live: model "${model}" on "${product}" is not executable: ${describeNonReadyState(candidate)}`,
        'UNKNOWN_MODEL',
      )
    }
    const view = this.catalog.current?.products[product]
    if (this.requireFresh && view?.stale === true) {
      throw new LlmError(
        `opencode-live: the official "${product}" list is stale and catalog.requireFresh is set;`
        + ' refresh the catalog or relax the setting',
        'STALE_CATALOG',
      )
    }
  }

  /** Refuse tool-bearing requests on models known not to support tools. */
  private guardTools(options: GenerateOptions): void {
    if (options.tools === undefined || options.tools.length === 0) return
    const candidate = this.candidateOf(options.provider, options.model)
    if (candidate?.tools === false) {
      throw new LlmError(
        `opencode-live: model "${options.model}" on "${options.provider}" does not support tool calls;`
        + ' send this request without tools or select a tool-capable model',
        'UNSUPPORTED_CAPABILITY',
      )
    }
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const product = this.productOf(provider)
    await this.catalog.ensureInitial(this.initialWaitMs)
    this.catalog.revalidateIfNeeded(product)
    return super.listModels(provider)
  }

  override async resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    await this.ensureSelectable(provider, model)
    return super.resolveModel(provider, model, signal)
  }

  override async prepareCall(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<PreparedAdapterCall> {
    await this.ensureSelectable(provider, model)
    const prepared = await super.prepareCall(provider, model, signal)
    return {
      // The model metadata and the stream come from the same captured
      // generation; a later catalog publication cannot mix them.
      model: prepared.model,
      stream: options => {
        this.guardTools(options)
        return prepared.stream(options)
      },
    }
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.guardTools(options)
    return super.stream(options)
  }
}
