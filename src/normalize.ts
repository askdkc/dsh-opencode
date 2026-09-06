/**
 * Candidate normalization: joining the official Zen/Go model lists with the
 * corresponding Models.dev provider metadata, and deciding per candidate id
 * whether it is executable, pending, unsupported, or gone.
 *
 * This module is pure: no network, no clock, no storage. Fetching owns the
 * HTTP facts; this module owns every domain decision about them.
 *
 * Model ids are kept exactly as both sources spell them: no case folding, no
 * prefix stripping, no regeneration from display names. The id a request
 * names is the id the upstream endpoint receives.
 *
 * @module opencode-live/normalize
 */

import type { ModelCost } from '@earendil-works/pi-ai'

/** The two OpenCode products this plugin serves. */
export type Product = 'zen' | 'go'

/** Wire protocols OpenCode Zen / Go models are known to speak. */
export type WireApi =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'

/** Lifecycle of one candidate model, per the design's candidate states. */
export type CandidateState =
  | 'ready'
  | 'metadata-pending'
  | 'unsupported-protocol'
  | 'catalog-only'
  | 'removed'

/** DSH route keys this plugin registers; fixed for the plugin's lifetime. */
export const ROUTE_ZEN = 'opencode-zen-live'
export const ROUTE_GO = 'opencode-go-live'
export type RouteId = typeof ROUTE_ZEN | typeof ROUTE_GO

export const ROUTE_BY_PRODUCT: Readonly<Record<Product, RouteId>> = {
  zen: ROUTE_ZEN,
  go: ROUTE_GO,
}

export const PRODUCT_BY_ROUTE: Readonly<Record<RouteId, Product>> = {
  [ROUTE_ZEN]: 'zen',
  [ROUTE_GO]: 'go',
}

/** Default display names for the two routes. */
export const DEFAULT_DISPLAY_NAME: Readonly<Record<RouteId, string>> = {
  [ROUTE_ZEN]: 'OpenCode Zen (Live)',
  [ROUTE_GO]: 'OpenCode Go (Live)',
}

/**
 * The fixed public sources. Only these URLs are fetched for catalog data, and
 * only the fixed product endpoints receive inference traffic; Models.dev
 * metadata never becomes a request destination.
 */
export const SOURCES = {
  zen: {
    modelsUrl: 'https://opencode.ai/zen/v1/models',
    baseUrl: 'https://opencode.ai/zen/v1',
    metadataProvider: 'opencode',
  },
  go: {
    modelsUrl: 'https://opencode.ai/zen/go/v1/models',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    metadataProvider: 'opencode-go',
  },
  metadataUrl: 'https://models.dev/api.json',
} as const

/** The models.dev provider id holding Zen model metadata. */
export const METADATA_PROVIDER_ZEN = SOURCES.zen.metadataProvider
/** The models.dev provider id holding Go model metadata. */
export const METADATA_PROVIDER_GO = SOURCES.go.metadataProvider

/**
 * Models.dev SDK identifiers verified against the wire APIs OpenCode Zen / Go
 * actually expose. Model-level `provider.npm` wins over the provider default.
 * Anything else is an unknown protocol: the model stays visible as
 * `unsupported-protocol` and is never executed, and no npm package named by
 * fetched data is ever installed or imported.
 */
const SDK_WIRE_APIS: Readonly<Record<string, WireApi>> = {
  '@ai-sdk/openai-compatible': 'openai-completions',
  '@ai-sdk/openai': 'openai-responses',
  '@ai-sdk/anthropic': 'anthropic-messages',
  '@ai-sdk/google': 'google-generative-ai',
}

/** The modalities this plugin's adapter stack can actually carry. */
const SUPPORTED_INPUT: readonly ('text' | 'image')[] = ['text', 'image']

/** The missing-information labels a diagnostic may name, in display order. */
const MISSING_ORDER = ['metadata', 'name', 'context', 'output', 'input', 'api'] as const

/** One candidate model in the plugin's catalog snapshot. */
export interface CatalogModel {
  readonly product: Product
  readonly route: RouteId
  readonly id: string
  readonly name: string
  readonly state: CandidateState
  readonly api?: WireApi
  readonly contextWindow?: number
  readonly maxInputTokens?: number
  readonly maxOutputTokens?: number
  readonly input: readonly ('text' | 'image')[]
  readonly tools: true | false | 'unknown'
  readonly reasoning: true | false | 'unknown'
  /** Verified reasoning-effort values, present only when the source names them. */
  readonly reasoningEfforts?: readonly string[]
  /** Source pricing when the metadata supplies it; absent is not zero-priced. */
  readonly cost?: ModelCost
  readonly missing: readonly string[]
  readonly provenance: Readonly<Record<string, string>>
}

/** One entry of the official product model list. */
export interface OfficialModel {
  readonly id: string
  readonly created?: number
  readonly ownedBy?: string
}

/** One successfully validated official list payload. */
export interface OfficialList {
  readonly models: ReadonlyMap<string, OfficialModel>
}

/** Validated Models.dev metadata for one model. */
export interface MetadataModel {
  readonly name?: string
  readonly contextWindow?: number
  readonly maxOutputTokens?: number
  readonly input?: readonly ('text' | 'image')[]
  readonly tools: true | false | 'unknown'
  readonly reasoning: true | false | 'unknown'
  readonly reasoningEfforts?: readonly string[]
  readonly cost?: ModelCost
  readonly npm?: string
}

/** Validated Models.dev metadata for one provider. */
export interface MetadataProvider {
  readonly npm?: string
  readonly models: ReadonlyMap<string, MetadataModel>
}

/** The result of validating one fetched payload. */
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly message: string }

/** Whether one number is a positive finite safe integer. */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/** Whether one value is a non-empty plain string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Validate an official `/models` response body.
 *
 * Only a JSON object shaped `{object: 'list', data: [...]}` with a
 * duplicate-free, non-empty id set counts. An empty list is a valid JSON body
 * but a catalog anomaly: the caller treats `ok: true` with zero models as an
 * abnormal candidate and keeps the previous set, which is why emptiness is
 * reported on the value rather than as a parse failure.
 * @param body - the fetched JSON value.
 * @returns the validated model list, or the reason it was refused.
 */
export function parseOfficialList(body: unknown): ParseResult<OfficialList> {
  if (typeof body !== 'object' || body === null) return { ok: false, code: 'INVALID_JSON', message: 'body is not a JSON object' }
  const record = body as Record<string, unknown>
  if (!Array.isArray(record.data)) return { ok: false, code: 'INVALID_JSON', message: 'data is not an array' }
  const models = new Map<string, OfficialModel>()
  for (const entry of record.data) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, code: 'INVALID_JSON', message: 'data entry is not an object' }
    }
    const item = entry as Record<string, unknown>
    if (!isNonEmptyString(item.id)) {
      return { ok: false, code: 'INVALID_JSON', message: 'data entry has no id' }
    }
    if (models.has(item.id)) {
      return { ok: false, code: 'DUPLICATE_ID', message: `duplicate model id "${item.id}"` }
    }
    models.set(item.id, {
      id: item.id,
      ...isPositiveInteger(item.created) ? { created: item.created } : {},
      ...isNonEmptyString(item.owned_by) ? { ownedBy: item.owned_by } : {},
    })
  }
  return { ok: true, value: { models } }
}

/**
 * Validate the slice of the Models.dev `api.json` this plugin consumes for
 * one provider. Unknown extra fields are ignored; every consumed field is
 * type-checked, and a consumed field of the wrong type is a refusal, not a
 * silent default.
 * @param body - the fetched JSON value.
 * @param providerId - the Models.dev provider id to extract.
 * @returns the validated provider metadata, or the reason it was refused.
 */
export function parseMetadataProvider(body: unknown, providerId: string): ParseResult<MetadataProvider> {
  if (typeof body !== 'object' || body === null) return { ok: false, code: 'INVALID_JSON', message: 'body is not a JSON object' }
  const root = body as Record<string, unknown>
  const provider = root[providerId]
  if (typeof provider !== 'object' || provider === null) {
    return { ok: false, code: 'INVALID_JSON', message: `provider "${providerId}" is missing` }
  }
  const providerRecord = provider as Record<string, unknown>
  const rawModels = providerRecord.models
  if (typeof rawModels !== 'object' || rawModels === null) {
    return { ok: false, code: 'INVALID_JSON', message: `provider "${providerId}" has no models dict` }
  }
  const defaultNpm = isNonEmptyString(providerRecord.npm) ? providerRecord.npm : undefined
  const models = new Map<string, MetadataModel>()
  for (const [id, raw] of Object.entries(rawModels)) {
    if (!isNonEmptyString(id) || typeof raw !== 'object' || raw === null) continue
    const parsed = parseMetadataModel(id, raw as Record<string, unknown>, defaultNpm)
    if (!parsed.ok) return parsed
    models.set(id, parsed.value)
  }
  return { ok: true, value: { ...defaultNpm === undefined ? {} : { npm: defaultNpm }, models } }
}

/** Validate one Models.dev model entry against the fields this plugin consumes. */
function parseMetadataModel(
  id: string,
  raw: Record<string, unknown>,
  defaultNpm: string | undefined,
): ParseResult<MetadataModel> {
  const modelNpm = readNpm(raw.provider)
  const npm = modelNpm ?? defaultNpm
  const limit = readLimit(raw.limit)
  const modalities = readModalities(raw.modalities)
  const reasoningOptions = readReasoningOptions(raw.reasoning_options)
  if (reasoningOptions && !reasoningOptions.ok) {
    return { ok: false, code: 'INVALID_JSON', message: `model "${id}" has invalid reasoning_options` }
  }
  const reasoning = readCapability(raw.reasoning)
  const tools = readCapability(raw.tool_call)
  const cost = readCost(raw.cost)
  return {
    ok: true,
    value: {
      ...isNonEmptyString(raw.name) ? { name: raw.name } : {},
      ...limit?.context !== undefined ? { contextWindow: limit.context } : {},
      ...limit?.output !== undefined ? { maxOutputTokens: limit.output } : {},
      ...modalities !== undefined ? { input: modalities } : {},
      tools,
      reasoning,
      ...(reasoningOptions?.ok && reasoningOptions.efforts !== undefined && reasoningOptions.efforts.length > 0)
        ? { reasoningEfforts: reasoningOptions.efforts }
        : {},
      ...cost,
      ...npm === undefined ? {} : { npm },
    },
  }
}

/** Read a models.dev per-model `provider` dict's npm override. */
function readNpm(provider: unknown): string | undefined {
  if (typeof provider !== 'object' || provider === null) return undefined
  const npm = (provider as Record<string, unknown>).npm
  return isNonEmptyString(npm) ? npm : undefined
}

/** Read the validated `limit` dict. */
function readLimit(limit: unknown): { context?: number; output?: number } | undefined {
  if (typeof limit !== 'object' || limit === null) return undefined
  const record = limit as Record<string, unknown>
  return {
    ...isPositiveInteger(record.context) ? { context: record.context } : {},
    ...isPositiveInteger(record.output) ? { output: record.output } : {},
  }
}

/**
 * Read the input modalities, intersected with what this plugin's adapter stack
 * can carry. Modalities the metadata names beyond that intersection (pdf,
 * video, audio) say nothing about what DSH can send, so they never widen the
 * declaration. The intersection is returned only when the metadata supplies a
 * list; an absent list is `undefined` ("no answer"), while a list whose
 * intersection is empty stays empty and makes the candidate pending.
 */
function readModalities(modalities: unknown): readonly ('text' | 'image')[] | undefined {
  if (typeof modalities !== 'object' || modalities === null) return undefined
  const raw = (modalities as Record<string, unknown>).input
  if (!Array.isArray(raw)) return undefined
  const declared = new Set(raw.filter((entry): entry is string => isNonEmptyString(entry)))
  return SUPPORTED_INPUT.filter(modality => declared.has(modality))
}

/** Read a `true`/`false` capability flag, with absence as 'unknown'. */
function readCapability(value: unknown): true | false | 'unknown' {
  if (value === true) return true
  if (value === false) return false
  return 'unknown'
}

/**
 * Read the verified reasoning-control options. Only an explicit effort list
 * verifies which levels a model accepts: `reasoning: true` alone verifies
 * nothing about request format, and a toggle verifies nothing about effort
 * levels, so both come back as no efforts.
 */
function readReasoningOptions(
  options: unknown,
): { ok: true; efforts?: readonly string[] } | { ok: false } {
  if (!Array.isArray(options)) return { ok: true }
  const efforts: string[] = []
  for (const entry of options) {
    if (typeof entry !== 'object' || entry === null) return { ok: false }
    const record = entry as Record<string, unknown>
    if (record.type === 'effort') {
      if (!Array.isArray(record.values)) return { ok: false }
      for (const value of record.values) {
        if (!isNonEmptyString(value)) return { ok: false }
        if (!efforts.includes(value)) efforts.push(value)
      }
    } else if (record.type !== 'toggle' && record.type !== 'budget_tokens') {
      return { ok: false }
    }
  }
  return { ok: true, ...(efforts.length > 0 ? { efforts } : {}) }
}

/** Read one finite number, or nothing. */
function rate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Read source pricing when it is well-formed; absent pricing is not fabricated. */
function readCost(cost: unknown): { cost?: ModelCost } {
  if (typeof cost !== 'object' || cost === null) return {}
  const record = cost as Record<string, unknown>
  const input = rate(record.input)
  const output = rate(record.output)
  if (input === undefined || output === undefined) return {}
  const cacheRead = rate(record.cache_read) ?? 0
  const cacheWrite = rate(record.cache_write) ?? 0
  return {
    cost: {
      input,
      output,
      cacheRead,
      cacheWrite,
      ...readCostTiers(record.tiers),
    },
  }
}

/** Read pricing tiers when well-formed. */
function readCostTiers(tiers: unknown): { tiers?: Exclude<ModelCost['tiers'], undefined> } {
  if (!Array.isArray(tiers)) return {}
  const mapped: Exclude<ModelCost['tiers'], undefined> = []
  for (const entry of tiers) {
    if (typeof entry !== 'object' || entry === null) return {}
    const record = entry as Record<string, unknown>
    const threshold = record.tier
    const size = typeof threshold === 'object' && threshold !== null
      ? (threshold as Record<string, unknown>).size
      : undefined
    if (!isPositiveInteger(size)) return {}
    const input = rate(record.input)
    const output = rate(record.output)
    if (input === undefined || output === undefined) return {}
    mapped.push({
      input,
      output,
      cacheRead: rate(record.cache_read) ?? 0,
      cacheWrite: rate(record.cache_write) ?? 0,
      inputTokensAbove: size,
    })
  }
  return { ...(mapped.length > 0 ? { tiers: mapped } : {}) }
}

/** The per-product inputs the join consumes. */
export interface ProductSourceInputs {
  /**
   * The official list this join trusts. Absent means no normal official fetch
   * has ever succeeded for this plugin instance, which is the one condition
   * under which Models.dev alone may not confirm a model.
   */
  official: { list: OfficialList; checkedAt?: number; successfulAt?: number } | undefined
  /** The Models.dev metadata slice, when one was ever validated. */
  metadata: { provider: MetadataProvider; checkedAt?: number; successfulAt?: number } | undefined
  /** Ids the previous snapshot confirmed against the official list. */
  previousOfficialIds: ReadonlySet<string>
}

/**
 * Join one product's official list with its Models.dev metadata into the
 * candidate map. The union of both sources' id sets is preserved: an unknown
 * id never disappears for lack of information, it just stops being
 * executable.
 *
 * Deletion is conservative in both directions: a candidate the fresh official
 * list no longer names and whose metadata is also gone becomes `removed`;
 * one the metadata still names becomes `catalog-only`. A fresh fetch that
 * yields no official list at all contributes nothing (the caller keeps the
 * previous list for that case).
 * @param product - the product being joined.
 * @param inputs - the validated source payloads.
 * @returns the candidate map, keyed by exact model id.
 */
export function joinProduct(
  product: Product,
  inputs: ProductSourceInputs,
): ReadonlyMap<string, CatalogModel> {
  const route = ROUTE_BY_PRODUCT[product]
  const officialModels = inputs.official?.list.models
  const metadataModels = inputs.metadata?.provider.models
  const ids = new Set<string>([
    ...officialModels?.keys() ?? [],
    ...metadataModels?.keys() ?? [],
  ])
  // Removed candidates are not named by either source this round; they exist
  // only through the previous snapshot's memory of official confirmation.
  for (const id of inputs.previousOfficialIds) {
    if (!officialModels?.has(id) && !metadataModels?.has(id)) ids.add(id)
  }

  const candidates = new Map<string, CatalogModel>()
  for (const id of ids) {
    const metadata = metadataModels?.get(id)
    const official = officialModels?.get(id)
    const wasOfficial = inputs.previousOfficialIds.has(id)
    const inOfficial = official !== undefined
    const inMetadata = metadata !== undefined

    let state: CandidateState
    if (inOfficial && !inMetadata) state = 'metadata-pending'
    else if (!inOfficial && inMetadata) state = 'catalog-only'
    else if (!inOfficial && !inMetadata) state = 'removed'
    else state = 'ready'

    const missing: string[] = []
    const npm = metadata?.npm
    const api = npm !== undefined ? SDK_WIRE_APIS[npm] : undefined
    if (!inMetadata) missing.push('metadata')
    if (metadata?.name === undefined) missing.push('name')
    if (metadata?.contextWindow === undefined) missing.push('context')
    if (metadata?.maxOutputTokens === undefined) missing.push('output')
    if (metadata?.input === undefined || metadata.input.length === 0) missing.push('input')
    if (inMetadata && npm === undefined) missing.push('api')

    if (state === 'ready') {
      if (missing.length > 0) state = 'metadata-pending'
      else if (api === undefined) state = 'unsupported-protocol'
    }

    candidates.set(id, Object.freeze({
      product,
      route,
      id,
      name: metadata?.name ?? id,
      state,
      ...api !== undefined ? { api } : {},
      ...metadata?.contextWindow !== undefined ? { contextWindow: metadata.contextWindow } : {},
      ...metadata?.maxOutputTokens !== undefined ? { maxOutputTokens: metadata.maxOutputTokens } : {},
      input: Object.freeze([...metadata?.input ?? []]),
      tools: metadata?.tools ?? 'unknown',
      reasoning: metadata?.reasoning ?? 'unknown',
      ...metadata?.reasoningEfforts !== undefined ? { reasoningEfforts: Object.freeze([...metadata.reasoningEfforts]) } : {},
      ...metadata?.cost !== undefined ? { cost: metadata.cost } : {},
      missing: Object.freeze(sortMissing(missing)),
      provenance: Object.freeze({
        official: inOfficial ? SOURCES[product].modelsUrl : wasOfficial ? `${SOURCES[product].modelsUrl} (previously listed)` : 'absent',
        metadata: inMetadata ? `${SOURCES.metadataUrl}#${SOURCES[product].metadataProvider}` : 'absent',
        ...npm !== undefined ? { npm } : {},
        ...inputs.official?.successfulAt !== undefined ? { officialConfirmedAt: new Date(inputs.official.successfulAt).toISOString() } : {},
        ...inputs.metadata?.successfulAt !== undefined ? { metadataConfirmedAt: new Date(inputs.metadata.successfulAt).toISOString() } : {},
      }),
    }))
  }
  return candidates
}

/** Order the missing-field labels for stable display. */
function sortMissing(missing: readonly string[]): readonly string[] {
  return [...missing].sort((left, right) => {
    const leftIndex = MISSING_ORDER.indexOf(left as (typeof MISSING_ORDER)[number])
    const rightIndex = MISSING_ORDER.indexOf(right as (typeof MISSING_ORDER)[number])
    return (leftIndex === -1 ? MISSING_ORDER.length : leftIndex)
      - (rightIndex === -1 ? MISSING_ORDER.length : rightIndex)
  })
}

/** One-line human explanation of a candidate's non-ready state. */
export function describeNonReadyState(candidate: CatalogModel): string {
  switch (candidate.state) {
    case 'ready':
      return 'ready'
    case 'metadata-pending':
      return `metadata-pending (missing: ${candidate.missing.join(', ') || 'unknown'})`
    case 'unsupported-protocol': {
      const npm = candidate.provenance['npm'] ?? 'unknown SDK'
      return `unsupported-protocol (${npm})`
    }
    case 'catalog-only':
      return 'catalog-only (not in the official product list)'
    case 'removed':
      return 'removed (no longer in the official product list)'
  }
}
