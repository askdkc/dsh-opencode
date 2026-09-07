/**
 * Non-secret configuration schema for the `opencode-live` plugin.
 *
 * The composition base (cordis.patch.yml) and the optional user-settings
 * section share this schema. Configuration carries references, never secret
 * values: the API key is named through `apiKeyEnv` and resolved per request
 * through the DSH credential seam.
 *
 * The plugin owns exactly two fixed routes. A provider entry keyed anything
 * else, or keyed with the wrong product, is refused where it is written.
 *
 * @module opencode-live/config
 */

import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { RetryPolicySchema, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { ResolvedRetryPolicy, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import type { Product, RouteId } from './normalize.ts'
import { PRODUCT_BY_ROUTE, ROUTE_BY_PRODUCT } from './normalize.ts'

/** Upper bound shared with DSH's timer facilities. */
const MAX_TIMER_DELAY_MS = 2_147_483_647

/** The credential reference both OpenCode products document. */
export const DEFAULT_API_KEY_ENV = 'OPENCODE_API_KEY'

/** Settings-schema defaults published to Client Settings descriptors. */
export const DEFAULT_PROVIDERS: Record<string, OpenCodeProviderConfig> = {
  [ROUTE_BY_PRODUCT.zen]: { product: 'zen', apiKeyEnv: DEFAULT_API_KEY_ENV },
  [ROUTE_BY_PRODUCT.go]: { product: 'go', apiKeyEnv: DEFAULT_API_KEY_ENV },
}

export const DEFAULT_REFRESH_INTERVAL_MS = 900_000
export const DEFAULT_LIST_REVALIDATE_AFTER_MS = 60_000
export const DEFAULT_TIMEOUT_MS = 15_000
export const DEFAULT_MAX_STALE_MS = 604_800_000
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
export const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
export const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
export const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

/** Configuration for one fixed live route; the `providers` dict key IS the route. */
export interface OpenCodeProviderConfig {
  /** Which OpenCode product this route serves; must match the route key. */
  product?: Product
  /** Credential reference (environment-variable name) resolved per request. */
  apiKeyEnv?: string
  /** Display name shown by configuration surfaces. */
  displayName?: string
  /** Additional deployment-owned request headers. */
  headers?: Record<string, string>
  /** Provider-owned model-request retry policy. */
  retryPolicy?: RetryPolicyConfig
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs?: number
}

/** Catalog refresh configuration. */
export interface CatalogConfigInput {
  refreshIntervalMs?: number
  listRevalidateAfterMs?: number
  timeoutMs?: number
  maxStaleMs?: number
  requireFresh?: boolean
  /** Cache file location; defaults under the DSH home. */
  cachePath?: string
}

/** Plugin configuration. */
export interface Config {
  providers?: Record<string, OpenCodeProviderConfig>
  catalog?: CatalogConfigInput
}

const productSchema = z.union([
  z.const('zen').required(),
  z.const('go').required(),
]) as unknown as z<Product>

const providerSchema: z<OpenCodeProviderConfig> = z.object({
  product: productSchema,
  apiKeyEnv: z.string().role('credential-ref'),
  displayName: z.string(),
  headers: z.dict(z.string()),
  retryPolicy: RetryPolicySchema,
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS),
})

const catalogSchema: z<CatalogConfigInput> = z.object({
  refreshIntervalMs: z.number().step(1).min(1),
  listRevalidateAfterMs: z.number().step(1).min(1),
  timeoutMs: z.number().step(1).min(1),
  maxStaleMs: z.number().step(1).min(1),
  requireFresh: z.boolean(),
  cachePath: z.string(),
})

/** Runtime schema for {@link Config}. */
export const Config: z<Config> = z.object({
  providers: z.dict(providerSchema).default(DEFAULT_PROVIDERS),
  catalog: catalogSchema.default({}),
})

/** One validated, detached live-route profile. */
export interface ResolvedProviderConfig {
  readonly route: RouteId
  readonly product: Product
  readonly apiKeyEnv: CredentialRef
  readonly displayName: string
  readonly headers?: Readonly<Record<string, string>>
  readonly retryPolicy: ResolvedRetryPolicy
  readonly streamIdleTimeoutMs: number
}

/** Validated catalog settings. */
export interface ResolvedCatalogConfig {
  readonly refreshIntervalMs: number
  readonly listRevalidateAfterMs: number
  readonly timeoutMs: number
  readonly maxStaleMs: number
  readonly requireFresh: boolean
  readonly cachePath?: string
}

/** Fully validated plugin configuration, detached from its input. */
export interface ResolvedPluginConfig {
  readonly providers: ReadonlyMap<RouteId, ResolvedProviderConfig>
  readonly catalog: ResolvedCatalogConfig
}

/** Whether one number is a positive finite integer within timer bounds. */
function isBoundedPositiveInteger(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max
}

/** Validate one bounded catalog interval field. */
function requireInterval(
  value: number | undefined,
  fallback: number,
  label: string,
  max: number = MAX_TIMER_DELAY_MS,
): number {
  const resolved = value ?? fallback
  if (!isBoundedPositiveInteger(resolved, max)) {
    throw new Error(`opencode-live: catalog.${label} must be a positive integer no greater than ${max}`)
  }
  return resolved
}

/**
 * Validate configuration and resolve every default. This is the one explicit
 * resolve step; an invalid route key, a product/route mismatch, or an out-of
 * -bound interval fails loudly here instead of disabling a route silently.
 * @param config - the raw configuration value.
 * @returns detached validated configuration.
 */
export function resolveConfig(config: Config): ResolvedPluginConfig {
  const providers = new Map<RouteId, ResolvedProviderConfig>()
  const entries = Object.entries(config.providers ?? {})
  if (entries.length === 0) {
    // No configuration at all is the composition's seed posture: serve both
    // fixed routes with their documented defaults.
    for (const route of [ROUTE_BY_PRODUCT.zen, ROUTE_BY_PRODUCT.go]) {
      providers.set(route, resolveProvider(route, { product: PRODUCT_BY_ROUTE[route], apiKeyEnv: DEFAULT_API_KEY_ENV }))
    }
  }
  for (const [route, source] of entries) {
    if (route !== ROUTE_BY_PRODUCT.zen && route !== ROUTE_BY_PRODUCT.go) {
      throw new Error(
        `opencode-live: provider "${route}" is not a route this plugin owns;`
        + ` the fixed routes are ${ROUTE_BY_PRODUCT.zen} and ${ROUTE_BY_PRODUCT.go}`,
      )
    }
    const resolved = resolveProvider(route as RouteId, source)
    const existing = providers.get(resolved.route)
    if (existing !== undefined) {
      throw new Error(`opencode-live: provider "${route}" is declared twice`)
    }
    providers.set(resolved.route, resolved)
  }

  const catalog: ResolvedCatalogConfig = {
    refreshIntervalMs: requireInterval(config.catalog?.refreshIntervalMs, DEFAULT_REFRESH_INTERVAL_MS, 'refreshIntervalMs'),
    listRevalidateAfterMs: requireInterval(config.catalog?.listRevalidateAfterMs, DEFAULT_LIST_REVALIDATE_AFTER_MS, 'listRevalidateAfterMs'),
    timeoutMs: requireInterval(config.catalog?.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs'),
    maxStaleMs: requireInterval(config.catalog?.maxStaleMs, DEFAULT_MAX_STALE_MS, 'maxStaleMs'),
    requireFresh: config.catalog?.requireFresh ?? false,
    ...config.catalog?.cachePath !== undefined ? { cachePath: requireCachePath(config.catalog.cachePath) } : {},
  }
  return { providers, catalog }
}

/** Validate one provider entry against its fixed route. */
function resolveProvider(route: RouteId, source: OpenCodeProviderConfig): ResolvedProviderConfig {
  const product = source.product ?? PRODUCT_BY_ROUTE[route]
  if (PRODUCT_BY_ROUTE[route] !== product) {
    throw new Error(
      `opencode-live: provider "${route}" declares product "${source.product}", but this route serves "${PRODUCT_BY_ROUTE[route]}"`,
    )
  }
  const apiKeyEnv = credentialRef(source.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
  const streamIdleTimeoutMs = source.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `opencode-live: provider "${route}" streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  if (source.displayName !== undefined && source.displayName.length === 0) {
    throw new Error(`opencode-live: provider "${route}" has an empty displayName`)
  }
  assertValidHeaders(route, source.headers)
  return {
    route,
    product,
    apiKeyEnv,
    displayName: source.displayName ?? defaultDisplayName(route),
    ...source.headers !== undefined ? { headers: { ...source.headers } } : {},
    retryPolicy: resolveRetryPolicy(source.retryPolicy, `opencode-live: provider "${route}" retryPolicy`),
    streamIdleTimeoutMs,
  }
}

/** The default display name for one fixed route. */
function defaultDisplayName(route: RouteId): string {
  return route === ROUTE_BY_PRODUCT.zen ? 'OpenCode Zen (Live)' : 'OpenCode Go (Live)'
}

/** Reject a header Fetch cannot carry, naming the route and field. */
function assertValidHeaders(route: string, headers: Readonly<Record<string, string>> | undefined): void {
  for (const [name, value] of Object.entries(headers ?? {})) {
    try {
      new Headers([[name, value]])
    } catch {
      throw new Error(
        `opencode-live: provider "${route}" header "${name}" is not valid for Fetch;`
        + ' use a valid HTTP field name and a single-line value representable as bytes',
      )
    }
  }
}

/** Validate the optional cache path override. */
function requireCachePath(path: string): string {
  if (path.length === 0) {
    throw new Error('opencode-live: catalog.cachePath must be a non-empty path when set')
  }
  return path
}

/**
 * Refuse a section this plugin could not serve. Registered as the settings
 * namespace's validator so an invalid route or interval is rejected where it
 * is written instead of silently disabling a route.
 * @param config - the resolved section to check.
 * @throws Error naming the offending configuration entry.
 */
export function assertServiceable(config: Config): void {
  resolveConfig(config)
}
