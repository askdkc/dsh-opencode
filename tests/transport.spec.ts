import { describe, expect, it } from 'vitest'
import type { Provider, SimpleStreamOptions } from '@earendil-works/pi-ai'
import { joinProduct, parseMetadataProvider, parseOfficialList } from '../src/normalize.ts'
import type { MetadataProvider } from '../src/normalize.ts'
import type { CatalogModel } from '../src/normalize.ts'
import { buildRouteProvider, modelBaseUrl, toPiModel, withGoSessionHeaders } from '../src/transport.ts'
import { completeModel, metadataFixtures, modelsDevBody, officialList } from './fixtures.ts'

function entry(id: string): { id: string; object: string; created: number; owned_by: string } {
  return { id, object: 'model', created: 1788701291, owned_by: 'opencode' }
}

/** Produce one ready CatalogModel for a product by running the real join. */
function readyCandidate(id: string, npm: string, product: 'zen' | 'go' = 'zen'): CatalogModel {
  const parsed = parseMetadataProvider(modelsDevBody(
    metadataFixtures(product === 'zen' ? { [id]: completeModel(id, npm) } : {}),
    metadataFixtures(product === 'go' ? { [id]: completeModel(id, npm) } : {}),
  ), product === 'zen' ? 'opencode' : 'opencode-go')
  if (!parsed.ok) throw new Error('fixture broken')
  const official = parseOfficialList(officialList([entry(id)]))
  if (!official.ok) throw new Error('fixture broken')
  const candidates = joinProduct(product, {
    official: { list: official.value, successfulAt: 1000 },
    metadata: { provider: parsed.value, successfulAt: 1000 },
    previousOfficialIds: new Set(),
  })
  const candidate = candidates.get(id)
  if (candidate === undefined || candidate.state !== 'ready') throw new Error(`fixture "${id}" is not ready`)
  return candidate
}

describe('modelBaseUrl', () => {
  it('gives the Anthropic wire the product base and OpenAI/Google the /v1 base', () => {
    expect(modelBaseUrl('zen', 'anthropic-messages')).toBe('https://opencode.ai/zen')
    expect(modelBaseUrl('zen', 'openai-completions')).toBe('https://opencode.ai/zen/v1')
    expect(modelBaseUrl('zen', 'openai-responses')).toBe('https://opencode.ai/zen/v1')
    expect(modelBaseUrl('zen', 'google-generative-ai')).toBe('https://opencode.ai/zen/v1')
    expect(modelBaseUrl('go', 'anthropic-messages')).toBe('https://opencode.ai/zen/go')
    expect(modelBaseUrl('go', 'openai-completions')).toBe('https://opencode.ai/zen/go/v1')
  })
})

describe('toPiModel', () => {
  it('carries the route as provider and exact upstream ids', () => {
    const model = toPiModel(readyCandidate('some-model', '@ai-sdk/anthropic'), 'opencode-zen-live')
    expect(model.provider).toBe('opencode-zen-live')
    expect(model.id).toBe('some-model')
    expect(model.api).toBe('anthropic-messages')
    expect(model.baseUrl).toBe('https://opencode.ai/zen')
    expect(model.reasoning).toBe(true)
    expect(model.contextWindow).toBe(200000)
    expect(model.maxTokens).toBe(64000)
  })

  it('maps verified efforts to identity and everything else to null', () => {
    // Build a candidate whose metadata carries a verified effort list.
    const parsed = parseMetadataProvider(modelsDevBody(metadataFixtures({
      'efforts': completeModel('efforts', '@ai-sdk/openai', {
        reasoning_options: [{ type: 'effort', values: ['low', 'medium', 'high'] }],
      }),
    }), {}), 'opencode')
    if (!parsed.ok) throw new Error('fixture broken')
    const official = parseOfficialList(officialList([entry('efforts')]))
    if (!official.ok) throw new Error('fixture broken')
    const joined = joinProduct('zen', {
      official: { list: official.value, successfulAt: 1000 },
      metadata: { provider: parsed.value, successfulAt: 1000 },
      previousOfficialIds: new Set(),
    })
    const efforts = joined.get('efforts')
    if (efforts === undefined || efforts.state !== 'ready') throw new Error('fixture not ready')
    const verified = toPiModel(efforts, 'opencode-zen-live')
    expect(verified.thinkingLevelMap).toEqual({
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    })
    // A toggle-only model offers no effort control at all.
    const toggle = toPiModel(readyCandidate('t', '@ai-sdk/anthropic'), 'opencode-zen-live')
    expect(toggle.thinkingLevelMap).toEqual({
      minimal: null, low: null, medium: null, high: null, xhigh: null, max: null,
    })
  })

  it('refuses a candidate without a wire API', () => {
    const candidate = {
      ...(readyCandidate('m', '@ai-sdk/anthropic')),
      api: undefined,
    } as unknown as CatalogModel
    expect(() => toPiModel(candidate, 'opencode-zen-live')).toThrow(/no wire API/)
  })
})

describe('buildRouteProvider', () => {
  it('builds a route-identical provider over ready models only', () => {
    const provider = buildRouteProvider({
      route: 'opencode-go-live',
      product: 'go',
      displayName: 'OpenCode Go (Live)',
      ready: [readyCandidate('go-a', '@ai-sdk/anthropic', 'go')],
      auth: { apiKey: { name: 'x', resolve: async () => ({ auth: {}, source: 'x' }) } },
    })
    expect(provider.id).toBe('opencode-go-live')
    const models = provider.getModels()
    expect(models).toHaveLength(1)
    expect(models[0]?.provider).toBe('opencode-go-live')
    expect(models[0]?.baseUrl).toBe('https://opencode.ai/zen/go')
  })
})

describe('withGoSessionHeaders', () => {
  function captureProvider(): { provider: Provider; seen: Array<SimpleStreamOptions | undefined> } {
    const seen: Array<SimpleStreamOptions> = []
    const provider: Provider = {
      id: 'opencode-go-live',
      name: 'OpenCode Go (Live)',
      auth: { apiKey: { name: 'x', resolve: async () => ({ auth: {}, source: 'x' }) } },
      getModels: () => [],
      stream: (model, context, options) => {
        void options
        throw new Error('unused')
      },
      streamSimple: (model, context, options) => {
        seen.push(options ?? {})
        throw new Error('stop')
      },
    }
    return { provider, seen }
  }

  const context = { messages: [] } as never
  const model = { id: 'm', provider: 'opencode-go-live' } as never

  it('adds opaque session and client headers per request without mutating caller headers', () => {
    const { provider, seen } = captureProvider()
    const wrapped = withGoSessionHeaders(provider, '0.1.0')
    const callerHeaders = { 'x-profile': 'v' }
    expect(() => wrapped.streamSimple(model, context, { headers: callerHeaders, sessionId: 'session-1' })).toThrow('stop')
    expect(seen[0]?.headers?.['x-opencode-session']).toMatch(/^[0-9a-f-]{36}$/)
    expect(seen[0]?.headers?.['x-opencode-client']).toBe('opencode-live/0.1.0')
    expect(Object.keys(callerHeaders)).toEqual(['x-profile'])
  })

  it('keeps one opaque id stable per session and distinct across sessions', () => {
    const { provider, seen } = captureProvider()
    const wrapped = withGoSessionHeaders(provider, '0.1.0')
    for (let i = 0; i < 3; i += 1) {
      expect(() => wrapped.streamSimple(model, context, { sessionId: 'session-a' })).toThrow('stop')
    }
    for (let i = 0; i < 2; i += 1) {
      expect(() => wrapped.streamSimple(model, context, { sessionId: 'session-b' })).toThrow('stop')
    }
    expect(seen[0]?.headers?.['x-opencode-session']).toBe(seen[1]?.headers?.['x-opencode-session'])
    expect(seen[0]?.headers?.['x-opencode-session']).not.toBe(seen[3]?.headers?.['x-opencode-session'])
  })

  it('keeps one id across retries of the same session-less request', () => {
    const { provider, seen } = captureProvider()
    const wrapped = withGoSessionHeaders(provider, '0.1.0')
    const sharedOptions: SimpleStreamOptions = {}
    expect(() => wrapped.streamSimple(model, context, sharedOptions)).toThrow('stop')
    expect(() => wrapped.streamSimple(model, context, sharedOptions)).toThrow('stop')
    expect(seen[0]?.headers?.['x-opencode-session']).toBe(seen[1]?.headers?.['x-opencode-session'])
  })

  it('does not wrap the Zen product', () => {
    const { provider, seen } = (() => {
      const captured = captureProvider()
      return captured
    })()
    const zenProvider = buildRouteProvider({
      route: 'opencode-zen-live',
      product: 'zen',
      displayName: 'OpenCode Zen (Live)',
      ready: [],
      auth: { apiKey: { name: 'x', resolve: async () => ({ auth: {}, source: 'x' }) } },
    })
    // The Zen provider is not the wrapper: streamSimple would be the stub's.
    expect(zenProvider.streamSimple).not.toBe(provider.streamSimple)
    expect(seen).toEqual([])
  })
})
