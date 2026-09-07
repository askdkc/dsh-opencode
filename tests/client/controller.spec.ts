import { describe, expect, it, vi } from 'vitest'
import { CredentialController } from '../../src/client/credential-controller.ts'
import { SetupController } from '../../src/client/setup-controller.ts'

function context(
  providers: Record<string, string>,
  writable = true,
  writeResult: unknown = { ok: true, value: undefined },
  settingsProviders: Record<string, { apiKeyEnv: string }> = {
    'opencode-zen-live': { apiKeyEnv: Object.keys(providers)[0] ?? 'OPENCODE_API_KEY' },
    'opencode-go-live': { apiKeyEnv: Object.keys(providers)[0] ?? 'OPENCODE_API_KEY' },
  },
) {
  const set = vi.fn(async () => writeResult)
  const describe = vi.fn(async (refs: readonly string[]) => ({
    ok: true,
    value: Object.fromEntries(refs.map(ref => [ref, { configured: providers[ref] === 'configured', writable }])),
  }))
  const settings = {
    ensure: vi.fn(async () => undefined),
    getSnapshot: () => ({
      status: 'ready' as const,
      view: { writable: true, hasDocument: true, namespaces: [{ ns: 'opencode-live', schema: {}, value: { providers: settingsProviders } }] },
    }),
    subscribe: () => () => undefined,
  }
  const ctx = {
    settingsScope: { describe: () => settings },
    remote: { credentials: { describe, set }, $on: () => () => undefined },
  }
  return { ctx, set, describe, settings }
}

describe('Client credential controller', () => {
  it('decodes credential envelopes and writes one shared reference', async () => {
    const fake = context({ OPENCODE_API_KEY: 'configured' })
    const controller = new CredentialController(fake.ctx as never)
    const state = await controller.loadRoute('zen')
    expect(state).toMatchObject({ kind: 'known', ref: 'OPENCODE_API_KEY', configured: true })
    const result = await controller.save('zen', 'sk-client-test', 'OPENCODE_API_KEY')
    expect(result.kind).toBe('saved')
    expect(fake.set).toHaveBeenCalledWith('OPENCODE_API_KEY', 'sk-client-test')
  })

  it('preserves separate custom refs and rejects failed writes', async () => {
    const fake = context({ ZEN_KEY: 'configured', GO_KEY: 'configured' }, true, { ok: false, error: { code: 'READ_ONLY' } }, {
      'opencode-zen-live': { apiKeyEnv: 'ZEN_KEY' },
      'opencode-go-live': { apiKeyEnv: 'GO_KEY' },
    })
    const controller = new CredentialController(fake.ctx as never)
    const zen = await controller.loadRoute('zen')
    const go = await controller.loadRoute('go')
    expect(zen).toMatchObject({ kind: 'known', ref: 'ZEN_KEY' })
    expect(go).toMatchObject({ kind: 'known', ref: 'GO_KEY' })
    expect((await controller.save('go', 'sk-client-test', 'GO_KEY')).kind).toBe('error')
    fake.set.mockResolvedValue({ ok: true, value: undefined })
    expect((await controller.save('go', 'sk-client-test', 'GO_KEY')).kind).toBe('saved')
  })

  it('treats missing envelopes as unavailable and setup selection changes state', async () => {
    const fake = context({})
    ;(fake.ctx.remote.credentials as any).describe = vi.fn(async (_refs: readonly string[]) => ({ ok: false, error: { code: 'UNAVAILABLE' } }))
    const controller = new CredentialController(fake.ctx as never)
    expect((await controller.loadRoute('zen')).kind).toBe('unavailable')
    const setup = new SetupController(fake.ctx as never)
    await setup.select({ id: 'zen', label: 'Zen' })
    expect(setup.getSnapshot()).toMatchObject({ open: true, route: 'zen' })
    setup.dispose()
  })

  it('does not invent a default reference when the settings namespace is missing', async () => {
    const fake = context({ OPENCODE_API_KEY: 'configured' })
    fake.settings.getSnapshot = () => ({ status: 'ready', view: { writable: true, hasDocument: true, namespaces: [] } })
    const controller = new CredentialController(fake.ctx as never)
    expect((await controller.loadRoute('zen')).kind).toBe('unavailable')
    expect(fake.describe).not.toHaveBeenCalled()
  })

  it('does not write when disposal wins the async save fence', async () => {
    const fake = context({ OPENCODE_API_KEY: 'configured' })
    const controller = new CredentialController(fake.ctx as never)
    await controller.loadRoute('zen')
    let release!: () => void
    fake.settings.ensure.mockImplementationOnce(() => new Promise<undefined>(resolve => { release = () => resolve(undefined) }))
    const save = controller.save('zen', 'sk-disposed', 'OPENCODE_API_KEY')
    await Promise.resolve()
    controller.dispose()
    release()
    expect((await save).kind).toBe('error')
    expect(fake.set).not.toHaveBeenCalled()
  })
})
