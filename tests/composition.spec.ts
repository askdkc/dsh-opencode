import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { OpenCodeProviderConfig } from '../src/config.ts'
import { apply, inject, name } from '../src/index.ts'
import { commandDefinitions } from '../src/commands.ts'
import { CatalogManager } from '../src/catalog.ts'
import { resolveConfig } from '../src/config.ts'
import { assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import { completeModel, metadataFixtures, modelsDevBody, testCatalogConfig } from './fixtures.ts'

const contexts: Context[] = []
const homes: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true })))
  vi.unstubAllGlobals()
})

interface CatalogPlan {
  zen: unknown
  go: unknown
  metadata: unknown
}

const PLAN: CatalogPlan = {
  zen: { object: 'list', data: [{ id: 'zen-model', object: 'model', created: 1, owned_by: 'opencode' }] },
  go: { object: 'list', data: [{ id: 'go-model', object: 'model', created: 1, owned_by: 'opencode' }] },
  metadata: modelsDevBody(
    metadataFixtures({ 'zen-model': completeModel('zen-model', '@ai-sdk/anthropic') }),
    metadataFixtures({ 'go-model': completeModel('go-model', '@ai-sdk/openai') }),
  ),
}

/** The plan with a second Zen model, used to prove dynamic re-registration. */
const PLAN_WITH_SECOND: CatalogPlan = {
  ...PLAN,
  zen: { object: 'list', data: [
    { id: 'zen-model', object: 'model', created: 1, owned_by: 'opencode' },
    { id: 'zen-model-2', object: 'model', created: 1, owned_by: 'opencode' },
  ] },
  metadata: modelsDevBody(
    metadataFixtures({
      'zen-model': completeModel('zen-model', '@ai-sdk/anthropic'),
      'zen-model-2': completeModel('zen-model-2', '@ai-sdk/openai'),
    }),
    metadataFixtures({ 'go-model': completeModel('go-model', '@ai-sdk/openai') }),
  ),
}

/** Stub the three public catalog URLs for the whole composition. */
function stubCatalogFetch(plan: CatalogPlan): void {
  vi.stubGlobal('fetch', (async (url: string): Promise<Response> => {
    if (url.endsWith('/zen/v1/models')) return Response.json(plan.zen, { headers: { etag: 'W/"zen"' } })
    if (url.endsWith('/zen/go/v1/models')) return Response.json(plan.go, { headers: { etag: 'W/"go"' } })
    if (url.endsWith('/api.json')) return Response.json(plan.metadata)
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch)
}

/** An owner-shaped agent backed by a real session. */
function agentOf(ctx: Context, tag: string): Agent {
  const session = ctx.sessions.create(SessionId(`opencode-${tag}`))
  return { id: session.id, session } as unknown as Agent
}

async function waitUntilReady(ctx: Context, attempts = 150): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    const zen = await ctx.llm.listModels('opencode-zen-live')
    const go = await ctx.llm.listModels('opencode-go-live')
    if (zen.length > 0 && go.length > 0) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('catalog never became ready')
}

const BASE_CONFIG: { providers: Record<string, OpenCodeProviderConfig> } = {
  providers: {
    'opencode-zen-live': { product: 'zen', apiKeyEnv: 'OPENCODE_API_KEY' },
    'opencode-go-live': { product: 'go', apiKeyEnv: 'OPENCODE_API_KEY' },
  },
}

interface Mounted {
  ctx: Context
  fiber: Awaited<ReturnType<Context['plugin']>>
}

async function mounted(plan: CatalogPlan = PLAN): Promise<Mounted> {
  const home = await mkdtemp(join(tmpdir(), 'opencode-composition-'))
  homes.push(home)
  stubCatalogFetch(plan)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(CommandRuntime)
  const fiber = await ctx.plugin({ name, inject, apply }, BASE_CONFIG)
  await waitUntilReady(ctx)
  return { ctx, fiber }
}

describe('opencode-live composition', () => {
  it('registers both fixed routes and their directory entries', async () => {
    const { ctx } = await mounted()
    const providers = ctx.llm.listProviders()
    expect(providers.map(entry => entry.id).sort()).toEqual(['opencode-go-live', 'opencode-zen-live'])
    expect(providers.find(entry => entry.id === 'opencode-zen-live')?.name).toBe('OpenCode Zen (Live)')
    const directory = ctx.llm.listConfigurableProviders()
    expect(directory.map(entry => entry.provider).sort()).toEqual(['opencode-go-live', 'opencode-zen-live'])
    for (const entry of directory) {
      expect(entry.settingsNs).toBe('opencode-live')
      expect(entry.settingsPath).toEqual(['providers', entry.provider])
      expect(entry.declared).toBe(true)
    }
  })

  it('serves the fetched ready set through the runtime without hardcoded ids', async () => {
    const { ctx } = await mounted()
    expect((await ctx.llm.listModels('opencode-zen-live')).map(model => model.id)).toEqual(['zen-model'])
    const resolved = await ctx.llm.resolveModelInfo('opencode-go-live', 'go-model')
    expect(resolved.id).toBe('go-model')
    expect(resolved.context?.contextWindow).toBe(200000)
    expect(resolved.name).toBe('Model go-model')
  })

  it('refuses unknown model ids with a bounded diagnostic', async () => {
    const { ctx } = await mounted()
    await expect(ctx.llm.resolveModelInfo('opencode-zen-live', 'never-seen'))
      .rejects.toMatchObject({ code: 'UNKNOWN_MODEL' })
  })

  it('re-registers when the ready set changes, via the real refresh command', async () => {
    const { ctx } = await mounted()
    expect((await ctx.llm.listModels('opencode-zen-live')).map(model => model.id)).toEqual(['zen-model'])
    // The official list now carries a second model; a forced refresh through
    // the registered command must publish it and re-register the routes so
    // the runtime observes the new model without a remount.
    // The plugin's start() runs detached; give its bookkeeping a moment to
    // settle so the forced refresh below issues its own fetches.
    await new Promise(resolve => setTimeout(resolve, 150))
    stubCatalogFetch(PLAN_WITH_SECOND)
    const execution = await ctx.commands.execute(
      agentOf(ctx, 'refresh'),
      '/opencode-refresh zen',
      [],
      new AbortController().signal,
    )
    expect(execution?.result.kind).toBe('success')
    await vi.waitFor(async () => {
      const models = (await ctx.llm.listModels('opencode-zen-live')).map(model => model.id)
      expect(models).toContain('zen-model-2')
    })
  })

  it('withdraws only its own registrations on unload and leaves a foreign adapter intact', async () => {
    const { ctx, fiber } = await mounted()
    const { LlmAdapter } = await import('@deepseek-ai/dsh-llm')
    class ForeignAdapter extends LlmAdapter {
      override stream(): never {
        throw new Error('unused')
      }
    }
    const foreignHandle = ctx.llm.registerAdapter(['other-provider'], new ForeignAdapter())
    expect(ctx.llm.listProviders().map(entry => entry.id)).toContain('other-provider')

    await fiber.dispose()
    const after = ctx.llm.listProviders().map(entry => entry.id)
    expect(after).toContain('other-provider')
    expect(after).not.toContain('opencode-zen-live')
    expect(after).not.toContain('opencode-go-live')
    foreignHandle()

    // The plugin's commands were withdrawn with its fiber: the name is free.
    const reRegister = ctx.commands.register({
      name: 'opencode-status',
      description: 'probe after unload',
      handler: () => ({ kind: 'success' }),
    })
    expect(typeof reRegister).toBe('function')
    reRegister()
  })

  it('refuses a second mount whose commands collide with the live ones', async () => {
    const { ctx } = await mounted()
    await expect(ctx.plugin({ name, inject, apply }, { providers: {} }))
      .rejects.toThrow(/already registered/)
  })
})

describe('opencode-live commands (direct handlers)', () => {
  async function commandCatalog(home: string, plan: CatalogPlan = PLAN): Promise<CatalogManager> {
    stubCatalogFetch(plan)
    const catalog = new CatalogManager({
      config: testCatalogConfig({ cachePath: join(home, 'cache.json') }),
    })
    await catalog.start()
    return catalog
  }

  it('reports status without exposing credential values', async () => {
    const home = await mkdtemp(join(tmpdir(), 'opencode-commands-'))
    homes.push(home)
    const catalog = await commandCatalog(home)
    const definitions = commandDefinitions({} as Context, {
      catalog,
      config: () => resolveConfig({}),
      describeCredential: async () => ({ configured: true, writable: true }),
      storeApiKey: async () => undefined,
      keyConfigured: async () => true,
      keyReadonly: async () => false,
    })
    const status = definitions.find(definition => definition.name === 'opencode-status')
    const result = await status?.handler({ rawInput: '', signal: new AbortController().signal } as never)
    expect(result?.kind).toBe('success')
    const text = result?.kind === 'success' ? result.text ?? '' : ''
    expect(text).toContain('opencode-zen-live')
    expect(text).toContain('models ready: 1')
    expect(text).not.toMatch(/sk-/i)
    catalog.stop()
  })

  it('lists ready models by default and non-ready candidates with reasons under --all', async () => {
    const home = await mkdtemp(join(tmpdir(), 'opencode-commands-'))
    homes.push(home)
    const catalog = await commandCatalog(home)
    const definitions = commandDefinitions({} as Context, {
      catalog,
      config: () => resolveConfig({}),
      describeCredential: async () => ({ configured: false, writable: true }),
      storeApiKey: async () => undefined,
      keyConfigured: async () => false,
      keyReadonly: async () => false,
    })
    const models = definitions.find(definition => definition.name === 'opencode-models')
    const readyOnly = await models?.handler({ rawInput: 'zen', signal: new AbortController().signal } as never)
    expect(readyOnly?.kind).toBe('success')
    expect(readyOnly?.kind === 'success' ? readyOnly.text ?? '' : '').toContain('1 ready models')

    // A plan whose official list names an id that metadata never explains.
    stubCatalogFetch({
      ...PLAN,
      zen: { object: 'list', data: [{ id: 'zen-model' }, { id: 'zen-pending', object: 'model', created: 1, owned_by: 'opencode' }] },
    })
    await catalog.refresh({ products: ['zen'] })
    const all = await models?.handler({ rawInput: 'zen --all', signal: new AbortController().signal } as never)
    expect(all?.kind).toBe('success')
    const text = all?.kind === 'success' ? all.text ?? '' : ''
    expect(text).toContain('zen-model — Model zen-model (ready')
    expect(text).toContain('zen-pending')
    expect(text).toContain('metadata-pending')
    catalog.stop()
  })

  it('rejects unsupported arguments with usage text', async () => {
    const catalog = new CatalogManager({ config: testCatalogConfig() })
    const definitions = commandDefinitions({} as Context, {
      catalog,
      config: () => resolveConfig({}),
      describeCredential: async () => ({ configured: false, writable: true }),
      storeApiKey: async () => undefined,
      keyConfigured: async () => false,
      keyReadonly: async () => false,
    })
    const refresh = definitions.find(definition => definition.name === 'opencode-refresh')
    const bad = await refresh?.handler({ rawInput: 'everything', signal: new AbortController().signal } as never)
    expect(bad?.kind).toBe('error')
    const models = definitions.find(definition => definition.name === 'opencode-models')
    const badModels = await models?.handler({ rawInput: 'everything', signal: new AbortController().signal } as never)
    expect(badModels?.kind).toBe('error')
  })

  it('stores a key typed in the input field and verifies no stray change', async () => {
    const catalog = new CatalogManager({ config: testCatalogConfig() })
    const stored: string[] = []
    const definitions = commandDefinitions({} as Context, {
      catalog,
      config: () => resolveConfig({}),
      describeCredential: async () => ({ configured: false, writable: true }),
      storeApiKey: async (value) => {
        assertUsableApiKey(value, 'opencode-live', 'input')
        stored.push(value)
        return undefined
      },
      keyConfigured: async () => stored.length > 0,
      keyReadonly: async () => false,
    })
    const enable = definitions.find(definition => definition.name === 'dsh-opencode')
    const withKey = await enable?.handler({ rawInput: 'sk-test-123', signal: new AbortController().signal } as never)
    expect(withKey?.kind).toBe('success')
    expect(stored).toEqual(['sk-test-123'])
    const text = withKey?.kind === 'success' ? withKey.text ?? '' : ''
    expect(text).toContain('OpenCode API key stored')
    expect(text).toContain('Zen and Go are enabled')
    expect(text).not.toMatch(/sk-test-123/i)
    catalog.stop()
  })

  it('rejects an unusable key without storing it', async () => {
    const catalog = new CatalogManager({ config: testCatalogConfig() })
    const stored: string[] = []
    const definitions = commandDefinitions({} as Context, {
      catalog,
      config: () => resolveConfig({}),
      describeCredential: async () => ({ configured: false, writable: true }),
      storeApiKey: async (value) => {
        try {
          assertUsableApiKey(value, 'opencode-live', 'input')
        } catch (error) {
          return (error as Error).message
        }
        stored.push(value)
        return undefined
      },
      keyConfigured: async () => stored.length > 0,
      keyReadonly: async () => false,
    })
    const enable = definitions.find(definition => definition.name === 'dsh-opencode')
    const blank = await enable?.handler({ rawInput: 'sk\nnot-a-header-safe-key', signal: new AbortController().signal } as never)
    expect(blank?.kind).toBe('error')
    expect(stored).toHaveLength(0)
    catalog.stop()
  })

  it('guides secure registration when no key is configured and none is typed', async () => {
    const catalog = new CatalogManager({ config: testCatalogConfig() })
    const definitions = commandDefinitions({} as Context, {
      catalog,
      config: () => resolveConfig({}),
      describeCredential: async () => ({ configured: false, writable: true }),
      storeApiKey: async () => undefined,
      keyConfigured: async () => false,
      keyReadonly: async () => false,
    })
    const enable = definitions.find(definition => definition.name === 'dsh-opencode')
    const withoutKey = await enable?.handler({ rawInput: '', signal: new AbortController().signal } as never)
    expect(withoutKey?.kind).toBe('success')
    const text = withoutKey?.kind === 'success' ? withoutKey.text ?? '' : ''
    expect(text).toContain('No OpenCode API key is configured yet')
    expect(text).toContain('input field')
    expect(text).not.toMatch(/sk-/i)
    catalog.stop()
  })

  it('refreshes both catalogs and confirms readiness once a key is configured', async () => {
    const home = await mkdtemp(join(tmpdir(), 'opencode-commands-'))
    homes.push(home)
    const catalog = await commandCatalog(home)
    const definitions = commandDefinitions({} as Context, {
      catalog,
      config: () => resolveConfig({}),
      describeCredential: async () => ({ configured: true, writable: true }),
      storeApiKey: async () => undefined,
      keyConfigured: async () => true,
      keyReadonly: async () => false,
    })
    const enable = definitions.find(definition => definition.name === 'dsh-opencode')
    const result = await enable?.handler({ rawInput: '', signal: new AbortController().signal } as never)
    expect(result?.kind).toBe('success')
    const text = result?.kind === 'success' ? result.text ?? '' : ''
    expect(text).toContain('Zen and Go are enabled')
    expect(text).toContain('opencode-zen-live')
    expect(text).toContain('opencode-go-live')
    expect(text).toContain('credential: configured')
    expect(text).not.toMatch(/sk-/i)
    catalog.stop()
  })
})
