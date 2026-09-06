/**
 * Assembly of the pi-ai `Provider` one live route registers.
 *
 * Every ready candidate becomes one pi-ai model whose `api` names one of the
 * four allowlisted wire protocols and whose `baseUrl` matches how pi-ai's own
 * OpenCode providers address the product endpoints: the Anthropic SDK appends
 * `/v1/messages` itself, so Anthropic-wire models use the product base
 * without `/v1`, while the OpenAI and Google implementations are given the
 * fixed `/v1` base.
 *
 * Model identity stays route-local: the provider id is the DSH route key, and
 * the model id is the exact upstream string. Nothing fetched from metadata is
 * imported or installed.
 *
 * The Go product requires honest self-identification and an opaque, stable
 * `x-opencode-session` header. The wrapper copies per-request headers rather
 * than mutating any shared profile object.
 *
 * @module opencode-live/transport
 */

import { createProvider } from '@earendil-works/pi-ai'
import type {
  Api,
  ApiStreamOptions,
  Context,
  Model,
  Provider,
  ProviderAuth,
  ProviderHeaders,
  ProviderStreams,
  SimpleStreamOptions,
  StreamOptions,
  ThinkingLevelMap,
} from '@earendil-works/pi-ai'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import type { CatalogModel, Product, RouteId, WireApi } from './normalize.ts'
import { SOURCES } from './normalize.ts'

/** The plugin's honest client identification value. */
export const PLUGIN_ID = 'opencode-live'
export const PLUGIN_VERSION = '0.1.2'

/** Header OpenCode Go documents for coding-agent session identification. */
export const SESSION_HEADER = 'x-opencode-session'
/** Header carrying this plugin's honest client identity alongside DSH attribution. */
export const CLIENT_HEADER = 'x-opencode-client'

/** The lazily loaded wire-protocol implementations, one per allowlisted API. */
const WIRE_APIS: Readonly<Record<WireApi, () => ProviderStreams>> = {
  'openai-completions': openAICompletionsApi,
  'openai-responses': openAIResponsesApi,
  'anthropic-messages': anthropicMessagesApi,
  'google-generative-ai': googleGenerativeAIApi,
}

/** Every pi-ai thinking level, in escalation order. */
const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/**
 * Pricing for a model whose metadata names no rates. This is the absence of a
 * fact, not a price claim: pi-ai requires numbers, and no consumer of this
 * plugin reports spend from them.
 */
const NO_COST: Model<Api>['cost'] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** Options for {@link buildRouteProvider}. */
export interface BuildRouteProviderOptions {
  readonly route: RouteId
  readonly product: Product
  readonly displayName: string
  /** The `ready` candidates of this product's current snapshot. */
  readonly ready: readonly CatalogModel[]
  readonly auth: ProviderAuth
}

/**
 * Build the pi-ai provider for one fixed live route over its ready models.
 * @param options - the route facts and validated candidates.
 * @returns the provider to register into the adapter's `Models` collection.
 */
export function buildRouteProvider(options: BuildRouteProviderOptions): Provider {
  const models = options.ready
    .filter(candidate => candidate.api !== undefined)
    .map(candidate => toPiModel(candidate, options.route))
  const provider = createProvider({
    id: options.route,
    name: options.displayName,
    baseUrl: SOURCES[options.product].baseUrl,
    auth: options.auth,
    models,
    api: {
      'openai-completions': WIRE_APIS['openai-completions'](),
      'openai-responses': WIRE_APIS['openai-responses'](),
      'anthropic-messages': WIRE_APIS['anthropic-messages'](),
      'google-generative-ai': WIRE_APIS['google-generative-ai'](),
    },
  })
  return options.product === 'go' ? withGoSessionHeaders(provider, PLUGIN_VERSION) : provider
}

/**
 * Convert one normalized candidate into a pi-ai model descriptor.
 * @param candidate - a `ready` candidate with a resolved wire API.
 * @param route - the owning route key; also the pi-ai provider id.
 * @returns the descriptor for the route's provider model list.
 */
export function toPiModel(candidate: CatalogModel, route: RouteId): Model<Api> {
  const api = candidate.api
  if (api === undefined) {
    throw new Error(`opencode-live: candidate "${candidate.id}" has no wire API and must not reach provider construction`)
  }
  return {
    id: candidate.id,
    name: candidate.name,
    api,
    provider: route,
    baseUrl: modelBaseUrl(candidate.product, api),
    reasoning: candidate.reasoning === true,
    ...thinkingLevelMap(candidate),
    input: [...candidate.input],
    cost: candidate.cost ?? NO_COST,
    // `ready` guarantees both capacities were published as positive integers;
    // no default capacity is fabricated here.
    contextWindow: candidate.contextWindow as number,
    maxTokens: candidate.maxOutputTokens as number,
  }
}

/**
 * The per-wire-API request base. Anthropic clients append `/v1/messages`
 * themselves; the OpenAI and Google clients are handed the fixed `/v1` base,
 * matching the verified endpoint layout of the product APIs.
 * @param product - the product being addressed.
 * @param api - the model's wire protocol.
 * @returns the exact base URL the pi-ai implementation receives.
 */
export function modelBaseUrl(product: Product, api: WireApi): string {
  const base = SOURCES[product].baseUrl
  return api === 'anthropic-messages' ? base.replace(/\/v1$/, '') : base
}

/**
 * The thinking-level map built only from verified effort values.
 *
 * A model whose reasoning capability is confirmed but whose control format is
 * a toggle (or unpublished) maps every level to `null`: pi-ai then offers no
 * effort control and requests keep the provider's default behavior. A model
 * with a verified effort list maps supported levels to themselves and marks
 * the rest unsupported, so an unverified level is refused rather than sent.
 * @param candidate - the normalized candidate.
 * @returns the map, or nothing when the model is not reasoning-capable.
 */
function thinkingLevelMap(candidate: CatalogModel): { thinkingLevelMap?: ThinkingLevelMap } {
  if (candidate.reasoning !== true) return {}
  const verified = candidate.reasoningEfforts
  const map: ThinkingLevelMap = {}
  for (const level of THINKING_LEVELS) {
    map[level] = verified === undefined ? null : verified.includes(level) ? level : null
  }
  return { thinkingLevelMap: map }
}

/**
 * Wrap one provider so every Go request carries the session and client
 * headers. The wrapping delegates dispatch to the wrapped provider's own
 * implementations, so the wire-API map and auth resolution are untouched.
 * @param provider - the provider built for the Go route.
 * @param version - the plugin version for honest client identification.
 * @returns a provider whose requests carry the copied headers.
 */
export function withGoSessionHeaders(provider: Provider, version: string): Provider {
  // Stable per DSH session id, bounded so long-running processes cannot grow
  // it without limit. Nothing about the session (paths, user names) enters
  // the derived value.
  const bySession = new Map<string, string>()
  // Per logical request when no session id exists: keyed on the options
  // object identity, which DSH keeps across that request's retry attempts.
  const byRequest = new WeakMap<object, string>()

  const sessionIdFor = (options: { sessionId?: unknown } | undefined): string => {
    if (options === undefined) return crypto.randomUUID()
    if (typeof options.sessionId === 'string' && options.sessionId.length > 0) {
      const existing = bySession.get(options.sessionId)
      if (existing !== undefined) return existing
      const created = crypto.randomUUID()
      if (bySession.size >= 512) {
        const oldest = bySession.keys().next().value
        if (oldest !== undefined) bySession.delete(oldest)
      }
      bySession.set(options.sessionId, created)
      return created
    }
    const existing = byRequest.get(options)
    if (existing !== undefined) return existing
    const created = crypto.randomUUID()
    byRequest.set(options, created)
    return created
  }

  const headersFor = (options: { sessionId?: unknown; headers?: ProviderHeaders } | undefined): ProviderHeaders => ({
    ...options?.headers,
    [SESSION_HEADER]: sessionIdFor(options),
    [CLIENT_HEADER]: `${PLUGIN_ID}/${version}`,
  })

  /**
   * Merge the copied headers into one request's options without mutating the
   * caller's object. The no-options path needs a bounded assertion because
   * `ApiStreamOptions` is a deferred per-API union at this untyped dispatch
   * seam; DSH's inference path (`streamSimple`) stays fully typed.
   */
  function withHeaders(options?: ApiStreamOptions<Api>): ApiStreamOptions<Api> {
    if (options === undefined) return { headers: headersFor(undefined) } as ApiStreamOptions<Api>
    return { ...options, headers: headersFor(options) }
  }

  return {
    ...provider,
    stream: (model, context, options) => provider.stream(model, context, withHeaders(options) as typeof options),
    streamSimple: (model, context, options) => {
      const headers = headersFor(options)
      if (options === undefined) return provider.streamSimple(model, context, { headers })
      return provider.streamSimple(model, context, { ...options, headers })
    },
  }
}
