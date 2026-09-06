/**
 * Generational immutable catalog snapshots.
 *
 * A snapshot is a frozen view of the candidates plus per-source freshness
 * facts. Its identity is a content hash over the model-meaningful information
 * only — never over fetch timestamps — so a periodic re-check that confirms
 * the catalog is unchanged does not rebuild providers or notify the registry.
 *
 * Everything published here is frozen. Later refreshes build a new snapshot;
 * no published map, array, or descriptor is ever mutated, and an in-flight
 * request that captured one snapshot keeps reading exactly what it captured.
 *
 * @module opencode-live/snapshot
 */

import { createHash } from 'node:crypto'
import type { CatalogModel, Product } from './normalize.ts'

/** Bounded freshness facts for one catalog source. */
export interface SourceState {
  /** Last fetch attempt, successful or not. */
  readonly lastCheckedAt?: number
  /** Last fetch that validated and contributed data. */
  readonly lastSuccessfulAt?: number
  /** The entity tag the source last served. */
  readonly etag?: string
  /** Stable refusal/failure code of the most recent attempt. */
  readonly lastErrorCode?: string
  /** Bounded, secret-free diagnostic of the most recent attempt. */
  readonly lastErrorMessage?: string
}

/** All sources the manager tracks, keyed by source id. */
export type SourceStates = ReadonlyMap<'zen-list' | 'go-list' | 'models-dev', SourceState>

/** The per-product view one snapshot publishes. */
export interface ProductView {
  /** Every candidate, executable or not, keyed by exact model id. */
  readonly candidates: ReadonlyMap<string, CatalogModel>
  /** Ids of the `ready` candidates, in source order. */
  readonly readyIds: readonly string[]
  /** Whether the official list behind this view is older than the staleness bound. */
  readonly stale: boolean
  /** Whether an official list has ever been validated for this product. */
  readonly officialConfirmed: boolean
  readonly counts: Readonly<Record<CandidateStateName, number>>
}

export type CandidateStateName =
  | 'ready'
  | 'metadata-pending'
  | 'unsupported-protocol'
  | 'catalog-only'
  | 'removed'

/** One immutable catalog snapshot. */
export interface CatalogSnapshot {
  readonly generation: number
  readonly createdAt: number
  /** Hash over the model-meaningful content; provider rebuilds key on this. */
  readonly contentHash: string
  readonly products: Readonly<Record<Product, ProductView>>
  readonly sources: SourceStates
}

const EMPTY_COUNTS: Readonly<Record<CandidateStateName, number>> = Object.freeze({
  ready: 0,
  'metadata-pending': 0,
  'unsupported-protocol': 0,
  'catalog-only': 0,
  removed: 0,
})

/** Inputs one snapshot build consumes. */
export interface SnapshotInputs {
  /** The product candidates produced by the join. */
  products: Readonly<Record<Product, ReadonlyMap<string, CatalogModel>>>
  /** Current per-source freshness facts. */
  sources: SourceStates
  /** Age beyond which a product's official list is displayed as stale. */
  maxStaleMs: number
  /** The wall clock used for `createdAt` and staleness bounds. */
  now: number
}

/** Deterministic serialization: sorted object keys, stable collection order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${stableStringify(member)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Hash the model-meaningful content of one snapshot's candidates. */
function contentHash(products: Readonly<Record<Product, ReadonlyMap<string, CatalogModel>>>): string {
  const digest = createHash('sha256')
  for (const product of ['zen', 'go'] as const) {
    digest.update(product)
    const models = [...products[product].values()].sort((left, right) => left.id.localeCompare(right.id))
    digest.update(stableStringify(models.map(model => ({
      id: model.id,
      state: model.state,
      api: model.api,
      name: model.name,
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxOutputTokens,
      maxInputTokens: model.maxInputTokens,
      input: [...model.input],
      tools: model.tools,
      reasoning: model.reasoning,
      reasoningEfforts: model.reasoningEfforts === undefined ? undefined : [...model.reasoningEfforts],
      cost: model.cost,
      missing: [...model.missing],
    }))))
  }
  return digest.digest('hex')
}

/**
 * Build the next snapshot. The generation increments only when the content
 * hash changes; a confirming re-check yields a new snapshot object with fresh
 * freshness facts but the same generation and the same frozen candidate maps.
 * @param previous - the snapshot currently published, if any.
 * @param inputs - what this build has available.
 * @returns the snapshot to publish.
 */
export function buildSnapshot(
  previous: CatalogSnapshot | undefined,
  inputs: SnapshotInputs,
): CatalogSnapshot {
  const hash = contentHash(inputs.products)
  const changed = previous === undefined || previous.contentHash !== hash
  const products = Object.freeze(Object.fromEntries(
    (['zen', 'go'] as const).map((product) => {
      const candidates = changed
        ? inputs.products[product]
        : previous.products[product].candidates
      const counts = { ...EMPTY_COUNTS }
      const readyIds: string[] = []
      for (const [id, candidate] of candidates) {
        counts[candidate.state as CandidateStateName] += 1
        if (candidate.state === 'ready') readyIds.push(id)
      }
      const officialState = inputs.sources.get(product === 'zen' ? 'zen-list' : 'go-list')
      const officialConfirmed = officialState?.lastSuccessfulAt !== undefined
      const stale = officialConfirmed
        && (officialState.lastSuccessfulAt === undefined
          || inputs.now - officialState.lastSuccessfulAt > inputs.maxStaleMs)
      return [product, Object.freeze({
        candidates,
        readyIds: Object.freeze(readyIds),
        stale,
        officialConfirmed,
        counts: Object.freeze(counts),
      })]
    }),
  )) as Readonly<Record<Product, ProductView>>
  return Object.freeze({
    generation: changed ? (previous?.generation ?? 0) + 1 : previous.generation,
    createdAt: inputs.now,
    contentHash: hash,
    products,
    sources: inputs.sources,
  })
}

/** A hash over each product's ready set; registration replacement keys on this. */
export function readySetHash(snapshot: CatalogSnapshot): string {
  return stableStringify({
    zen: snapshot.products.zen.readyIds,
    go: snapshot.products.go.readyIds,
  })
}
