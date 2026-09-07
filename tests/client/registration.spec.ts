import { describe, expect, it, vi } from 'vitest'
import { apply } from '../../src/client/index.ts'

describe('Client registrations', () => {
  it('waits for injection, remains live after apply, and disposes with the fiber', async () => {
    const decorated: unknown[] = []
    const registrations: Array<Record<string, unknown>> = []
    const dispose = vi.fn()
    const execute = vi.fn(async () => ({ ok: true, value: undefined }))
    let effectBody: (() => void | (() => void)) | undefined
    const settings = { describe: () => ({ ensure: async () => undefined, getSnapshot: () => ({ status: 'unavailable', view: undefined }), subscribe: () => () => undefined }) }
    const ctx = {
      inject: (_names: readonly string[], callback: (value: unknown) => void) => callback({
        commandUi: { decorate: (value: unknown) => { decorated.push(value); return dispose } },
        settingsScope: settings,
        remote: { credentials: { describe: async () => ({ ok: false }), set: async () => ({ ok: true }) }, commands: { execute }, $on: () => () => undefined },
        slots: {
          inject: (_name: string, factory: () => unknown) => { factory(); return dispose },
          register: (definition: Record<string, unknown>) => { registrations.push(definition); return dispose },
        },
        effect: (effect: () => void | (() => void)) => { effectBody = effect },
      }),
    }
    apply(ctx as never)
    expect(decorated).toHaveLength(0)
    const cleanup = effectBody?.()
    expect(decorated).toHaveLength(1)
    expect(registrations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'settings.models.provider-card', key: 'opencode-live' }),
      expect.objectContaining({ name: 'shell.overlay', id: 'opencode-live-setup' }),
    ]))
    expect(dispose).not.toHaveBeenCalled()
    await (decorated[0] as any).ui.onSelect({ id: 'refresh', label: 'refresh' }, { sessionId: 'session-1' })
    expect(execute).toHaveBeenCalledWith('session-1', '/opencode-refresh all', [], undefined)
    cleanup?.()
    expect(dispose).toHaveBeenCalled()
  })
})
