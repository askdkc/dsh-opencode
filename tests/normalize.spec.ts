import { describe, expect, it } from 'vitest'
import type { MetadataProvider } from '../src/normalize.ts'
import {
  describeNonReadyState,
  joinProduct,
  parseMetadataProvider,
  parseOfficialList,
} from '../src/normalize.ts'
import { buildSnapshot, readySetHash } from '../src/snapshot.ts'
import {
  completeModel,
  metadataFixtures,
  modelsDevBody,
  officialList,
} from './fixtures.ts'

function entry(id: string): { id: string; object: string; created: number; owned_by: string } {
  return { id, object: 'model', created: 1788701291, owned_by: 'opencode' }
}

/** One Models.dev provider slice used by every join test. */
const metadata: MetadataProvider = (() => {
  const parsed = parseMetadataProvider(modelsDevBody(metadataFixtures({
    'ready-model': completeModel('ready-model', '@ai-sdk/anthropic'),
    'effort-model': completeModel('effort-model', '@ai-sdk/openai', {
      reasoning_options: [{ type: 'effort', values: ['low', 'medium', 'high'] }],
    }),
    'unknown-sdk': completeModel('unknown-sdk', '@scope/never-imported'),
    'partial-model': { id: 'partial-model', name: 'Partial' },
  }), {}), 'opencode')
  if (!parsed.ok) throw new Error('fixture broken')
  return parsed.value
})()

describe('parseOfficialList', () => {
  it('accepts the published shape and preserves exact ids', () => {
    const parsed = parseOfficialList(officialList([entry('claude-opus-4-7'), entry('glm-5.3-flash')]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect([...parsed.value.models.keys()]).toEqual(['claude-opus-4-7', 'glm-5.3-flash'])
  })

  it('refuses non-JSON-object bodies, missing data arrays, and missing ids', () => {
    expect(parseOfficialList('server error html').ok).toBe(false)
    expect(parseOfficialList({ object: 'list' }).ok).toBe(false)
    expect(parseOfficialList({ object: 'list', data: [{ object: 'model' }] }).ok).toBe(false)
  })

  it('refuses duplicate ids', () => {
    const parsed = parseOfficialList(officialList([entry('x'), entry('x')]))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.code).toBe('DUPLICATE_ID')
  })

  it('reports an empty list as valid JSON with zero models', () => {
    const parsed = parseOfficialList(officialList([]))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value.models.size).toBe(0)
  })
})

describe('parseMetadataProvider', () => {
  it('extracts the two OpenCode providers from api.json', () => {
    const parsed = parseMetadataProvider(modelsDevBody(
      metadataFixtures({ 'a-model': completeModel('a-model', '@ai-sdk/anthropic') }),
      {},
    ), 'opencode')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.npm).toBe('@ai-sdk/openai-compatible')
    expect(parsed.value.models.get('a-model')?.name).toBe('Model a-model')
  })

  it('keeps invalid numeric limits as absent instead of fabricating them', () => {
    const parsed = parseMetadataProvider(modelsDevBody({
      'bad': { ...completeModel('bad', '@ai-sdk/anthropic'), limit: { context: 0, output: -5 } },
    }, {}), 'opencode')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.models.get('bad')?.contextWindow).toBeUndefined()
      expect(parsed.value.models.get('bad')?.maxOutputTokens).toBeUndefined()
    }
  })

  it('refuses malformed reasoning_options', () => {
    const parsed = parseMetadataProvider(modelsDevBody({
      'bad': { ...completeModel('bad', '@ai-sdk/anthropic'), reasoning_options: [{ type: 'effort' }] },
    }, {}), 'opencode')
    expect(parsed.ok).toBe(false)
  })
})

describe('joinProduct', () => {
  it('classifies official+metadata as ready with the model-level SDK choice', () => {
    const official = parseOfficialList(officialList([entry('ready-model')]))
    if (!official.ok) throw new Error('fixture broken')
    const candidates = joinProduct('zen', {
      official: { list: official.value, successfulAt: 1000 },
      metadata: { provider: metadata, successfulAt: 1000 },
      previousOfficialIds: new Set(),
    })
    const candidate = candidates.get('ready-model')
    expect(candidate?.state).toBe('ready')
    expect(candidate?.api).toBe('anthropic-messages')
    expect(candidate?.contextWindow).toBe(200000)
    expect(candidate?.maxOutputTokens).toBe(64000)
    expect(candidate?.input).toEqual(['text', 'image'])
    expect(candidate?.tools).toBe(true)
  })

  it('maps model-level npm overrides over the provider default and keeps verified efforts', () => {
    const official = parseOfficialList(officialList([entry('effort-model')]))
    if (!official.ok) throw new Error('fixture broken')
    const candidates = joinProduct('zen', {
      official: { list: official.value, successfulAt: 1000 },
      metadata: { provider: metadata, successfulAt: 1000 },
      previousOfficialIds: new Set(),
    })
    const effort = candidates.get('effort-model')
    expect(effort?.api).toBe('openai-responses')
    expect(effort?.reasoningEfforts).toEqual(['low', 'medium', 'high'])
  })

  it('marks official-only ids as metadata-pending and keeps them listed', () => {
    const official = parseOfficialList(officialList([entry('fresh-official')]))
    if (!official.ok) throw new Error('fixture broken')
    const candidates = joinProduct('zen', {
      official: { list: official.value, successfulAt: 1000 },
      metadata: { provider: metadata, successfulAt: 1000 },
      previousOfficialIds: new Set(),
    })
    const candidate = candidates.get('fresh-official')
    expect(candidate?.state).toBe('metadata-pending')
    expect(candidate?.missing).toContain('metadata')
    expect(describeNonReadyState(candidate as NonNullable<typeof candidate>)).toContain('metadata-pending')
  })

  it('never confirms a Models.dev-only id when no official list ever loaded', () => {
    const candidates = joinProduct('zen', {
      official: undefined,
      metadata: { provider: metadata, successfulAt: 1000 },
      previousOfficialIds: new Set(),
    })
    expect(candidates.get('ready-model')?.state).toBe('catalog-only')
  })

  it('marks unknown-sdk models unsupported-protocol without dropping them', () => {
    const official = parseOfficialList(officialList([entry('unknown-sdk')]))
    if (!official.ok) throw new Error('fixture broken')
    const candidates = joinProduct('zen', {
      official: { list: official.value, successfulAt: 1000 },
      metadata: { provider: metadata, successfulAt: 1000 },
      previousOfficialIds: new Set(),
    })
    const candidate = candidates.get('unknown-sdk')
    expect(candidate?.state).toBe('unsupported-protocol')
    expect(candidate?.provenance['npm']).toBe('@scope/never-imported')
  })

  it('keeps incomplete official models metadata-pending with named missing fields', () => {
    const official = parseOfficialList(officialList([entry('partial-model')]))
    if (!official.ok) throw new Error('fixture broken')
    const candidates = joinProduct('zen', {
      official: { list: official.value, successfulAt: 1000 },
      metadata: { provider: metadata, successfulAt: 1000 },
      previousOfficialIds: new Set(),
    })
    const candidate = candidates.get('partial-model')
    expect(candidate?.state).toBe('metadata-pending')
    expect(candidate?.missing).toEqual(['context', 'output', 'input'])
  })

  it('turns a formerly official id absent everywhere into removed', () => {
    const official = parseOfficialList(officialList([entry('ready-model')]))
    if (!official.ok) throw new Error('fixture broken')
    const candidates = joinProduct('zen', {
      official: { list: official.value, successfulAt: 2000 },
      metadata: { provider: metadata, successfulAt: 2000 },
      previousOfficialIds: new Set(['gone-model', 'ready-model']),
    })
    expect(candidates.get('gone-model')?.state).toBe('removed')
  })

  it('does not mutate the input metadata map', () => {
    const official = parseOfficialList(officialList([entry('ready-model')]))
    if (!official.ok) throw new Error('fixture broken')
    const before = metadata.models.size
    joinProduct('zen', {
      official: { list: official.value, successfulAt: 1000 },
      metadata: { provider: metadata, successfulAt: 1000 },
      previousOfficialIds: new Set(),
    })
    expect(metadata.models.size).toBe(before)
  })
})

describe('buildSnapshot', () => {
  function inputs(at: number): Parameters<typeof buildSnapshot>[1] {
    const official = parseOfficialList(officialList([entry('ready-model'), entry('effort-model')]))
    if (!official.ok) throw new Error('fixture broken')
    return {
      products: {
        zen: joinProduct('zen', {
          official: { list: official.value, successfulAt: at },
          metadata: { provider: metadata, successfulAt: at },
          previousOfficialIds: new Set(),
        }),
        go: joinProduct('go', { official: undefined, metadata: undefined, previousOfficialIds: new Set() }),
      },
      sources: new Map([
        ['zen-list', { lastCheckedAt: at, lastSuccessfulAt: at }],
        ['go-list', {}],
        ['models-dev', { lastCheckedAt: at, lastSuccessfulAt: at }],
      ]),
      maxStaleMs: 60000,
      now: at,
    }
  }

  it('bumps the generation only when model content changes', () => {
    const first = buildSnapshot(undefined, inputs(1000))
    expect(first.generation).toBe(1)
    const same = buildSnapshot(first, inputs(2000))
    expect(same.generation).toBe(1)
    expect(same.products.zen.candidates).toBe(first.products.zen.candidates)
    expect(readySetHash(same)).toBe(readySetHash(first))
  })

  it('keeps timestamps out of the content hash', () => {
    const first = buildSnapshot(undefined, inputs(1000))
    const later = buildSnapshot(first, inputs(99999999))
    expect(later.contentHash).toBe(first.contentHash)
  })
})
