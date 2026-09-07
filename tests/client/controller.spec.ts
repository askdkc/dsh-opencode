import { describe, expect, it, vi } from 'vitest'
import { CredentialController } from '../../src/client/credential-controller.ts'

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
  const unset = vi.fn(async (ref: string) => { delete providers[ref]; return { ok: true } })
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
    remote: { credentials: { describe, set, unset }, $on: (_event: string, _listener: () => void): (() => void) => () => undefined },
  }
  return { ctx, set, unset, describe, settings }
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

  it('treats missing envelopes as unavailable', async () => {
    const fake = context({})
    ;(fake.ctx.remote.credentials as any).describe = vi.fn(async (_refs: readonly string[]) => ({ ok: false, error: { code: 'UNAVAILABLE' } }))
    const controller = new CredentialController(fake.ctx as never)
    expect((await controller.loadRoute('zen')).kind).toBe('unavailable')
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
  it('reloads both mounted routes after a pushed credential update', async () => {
    const values = { OPENCODE_API_KEY: 'missing' }
    const fake = context(values)
    const handlers = new Map<string, () => void>()
    fake.ctx.remote.$on = ((event: string, listener: () => void) => {
      handlers.set(event, listener)
      return () => handlers.delete(event)
    })
    const controller = new CredentialController(fake.ctx as never)
    await controller.loadRoutes()
    values.OPENCODE_API_KEY = 'configured'
    handlers.get('credentials/reference-updated')?.()
    await vi.waitFor(() => {
      expect(controller.state('zen')).toMatchObject({ kind: 'known', configured: true })
      expect(controller.state('go')).toMatchObject({ kind: 'known', configured: true })
    })
    controller.dispose()
    expect(handlers.size).toBe(0)
  })

  it('does not return stale credential facts when a newer load wins', async () => {
    const fake = context({ OPENCODE_API_KEY: 'configured' })
    const controller = new CredentialController(fake.ctx as never)
    let release!: (result: Awaited<ReturnType<typeof fake.describe>>) => void
    fake.describe.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const old = controller.loadRoute('zen')
    await vi.waitFor(() => expect(release).toBeDefined())
    await controller.loadRoute('zen')
    release({ ok: true, value: { OPENCODE_API_KEY: { configured: false, writable: true } } })
    expect(await old).toMatchObject({ configured: true })
    expect(controller.state('zen')).toMatchObject({ configured: true })
  })

  it('deletes a shared key and refreshes both routes without changing settings', async () => {
    const values = { OPENCODE_API_KEY: 'configured' }
    const fake = context(values)
    const controller = new CredentialController(fake.ctx as never)
    await controller.loadRoutes()
    const before = structuredClone(fake.settings.getSnapshot())
    expect(await controller.remove('zen', 'OPENCODE_API_KEY')).toMatchObject({ kind: 'deleted', message: expect.stringContaining('Zen and Go') })
    expect(fake.unset).toHaveBeenCalledExactlyOnceWith('OPENCODE_API_KEY')
    expect(values).toEqual({})
    expect(controller.state('zen')).toMatchObject({ configured: false })
    expect(controller.state('go')).toMatchObject({ configured: false })
    expect(fake.settings.getSnapshot()).toEqual(before)
    expect(fake.set).not.toHaveBeenCalled()
  })

  it('deletes only the selected custom reference', async () => {
    const values = { ZEN_KEY: 'configured', GO_KEY: 'configured' }
    const fake = context(values, true, undefined, {
      'opencode-zen-live': { apiKeyEnv: 'ZEN_KEY' }, 'opencode-go-live': { apiKeyEnv: 'GO_KEY' },
    })
    const controller = new CredentialController(fake.ctx as never)
    await controller.loadRoutes()
    expect(await controller.remove('go', 'GO_KEY')).toMatchObject({ kind: 'deleted' })
    expect(values).toEqual({ ZEN_KEY: 'configured' })
    expect(controller.state('zen')).toMatchObject({ configured: true })
    expect(controller.state('go')).toMatchObject({ configured: false })
  })

  it('refuses deletion of read-only credentials', async () => {
    const fake = context({ OPENCODE_API_KEY: 'configured' }, false)
    const controller = new CredentialController(fake.ctx as never)
    await controller.loadRoute('zen')
    expect(await controller.remove('zen', 'OPENCODE_API_KEY')).toMatchObject({ kind: 'error', message: expect.stringContaining('read-only') })
    expect(fake.unset).not.toHaveBeenCalled()
  })

  it.each(['reference', 'sharing', 'unavailable', 'disposed'])('refuses deletion when %s changes during revalidation', async change => {
    const profiles = { 'opencode-zen-live': { apiKeyEnv: 'ZEN_KEY' }, 'opencode-go-live': { apiKeyEnv: 'GO_KEY' } }
    const fake = context({ ZEN_KEY: 'configured', GO_KEY: 'configured' }, true, undefined, profiles)
    const controller = new CredentialController(fake.ctx as never)
    await controller.loadRoute('zen')
    fake.settings.ensure.mockImplementationOnce(async () => {
      if (change === 'reference') profiles['opencode-zen-live'].apiKeyEnv = 'NEW_KEY'
      if (change === 'sharing') profiles['opencode-go-live'].apiKeyEnv = 'ZEN_KEY'
      if (change === 'unavailable') throw new Error('offline')
      if (change === 'disposed') controller.dispose()
    })
    expect(await controller.remove('zen', 'ZEN_KEY')).toMatchObject({ kind: 'error' })
    expect(fake.unset).not.toHaveBeenCalled()
  })

  it.each(['rejected', 'throws'])('reports a failed deletion (%s) without claiming success', async mode => {
    const fake = context({ OPENCODE_API_KEY: 'configured' })
    fake.unset.mockImplementationOnce(async () => {
      if (mode === 'throws') throw new Error('backend details')
      return { ok: false }
    })
    const controller = new CredentialController(fake.ctx as never)
    await controller.loadRoute('zen')
    expect(await controller.remove('zen', 'OPENCODE_API_KEY')).toMatchObject({ kind: 'error', message: 'Could not delete the API key. Try again.' })
    expect(controller.state('zen')).toMatchObject({ configured: true })
  })

  it('does not claim the key is absent when another source still supplies it', async () => {
    const fake = context({ OPENCODE_API_KEY: 'configured' })
    fake.unset.mockImplementationOnce(async () => ({ ok: true }))
    const controller = new CredentialController(fake.ctx as never)
    await controller.loadRoute('zen')
    expect(await controller.remove('zen', 'OPENCODE_API_KEY')).toMatchObject({ kind: 'deleted-unconfirmed', message: expect.stringContaining('still configured') })
  })

  it('blocks saving or deleting the same shared reference during a deletion', async () => {
    const fake = context({ OPENCODE_API_KEY: 'configured' })
    let finish!: () => void
    fake.unset.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ ok: true }) }))
    const controller = new CredentialController(fake.ctx as never)
    await controller.loadRoutes()
    const deletion = controller.remove('zen', 'OPENCODE_API_KEY')
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect(await controller.save('go', 'sk-test', 'OPENCODE_API_KEY')).toMatchObject({ kind: 'error' })
    expect(await controller.remove('go', 'OPENCODE_API_KEY')).toMatchObject({ kind: 'error' })
    expect(fake.set).not.toHaveBeenCalled()
    expect(fake.unset).toHaveBeenCalledTimes(1)
    finish()
    await deletion
  })

})
