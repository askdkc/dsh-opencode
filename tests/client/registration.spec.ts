import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { clientModule, registryPlugin } from './runtime.ts'
import type { CredentialController } from '../../src/client/credential-controller.ts'
import type * as Client from '../../src/client/index.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

describe('shipped Client with the real Harness slot registry', () => {
  it.each([true, false])('registers the key form without commands (Models loaded first: %s)', async (modelsFirst) => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(await registryPlugin())
    const values = new Map<string, string>()
    const settings = {
      ensure: async () => undefined,
      getSnapshot: () => ({ status: 'ready', view: { namespaces: [{ ns: 'opencode-live', value: { providers: {
        'opencode-zen-live': { apiKeyEnv: 'OPENCODE_API_KEY' },
        'opencode-go-live': { apiKeyEnv: 'OPENCODE_API_KEY' },
      } } }] } }),
      subscribe: () => () => undefined,
    }
    ctx.provide('settingsScope')
    ctx.provide('remote')
    ctx.provide('remote.credentials')
    ctx.set('settingsScope', { describe: () => settings } as never)
    ctx.set('remote', { credentials: {
      describe: async (refs: string[]) => ({ ok: true, value: Object.fromEntries(refs.map(ref => [ref, { configured: values.has(ref), writable: true }])) }),
      set: async (ref: string, value: string) => { values.set(ref, value); return { ok: true } },
      unset: async (ref: string) => { values.delete(ref); return { ok: true } },
    }, $on: () => () => undefined } as never)
    ctx.set('remote.credentials', ctx.remote.credentials)
    const declare = () => ctx.slots.register({
      name: 'root', children: { 'settings.models.provider-card': { kind: 'keyed', scope: 'root' } },
    }, (_props: PropsRenderSlots<'settings.models.provider-card'>) => null)
    let removeModels = modelsFirst ? declare() : undefined
    const client = await clientModule<typeof Client>(new URL('../../lib/client.js', import.meta.url))
    const fiber = await ctx.plugin(client)
    if (!modelsFirst) removeModels = declare()
    const entries = () => ctx.slots.entriesOfSlot('settings.models.provider-card')
    expect(entries()).toHaveLength(1)
    expect(entries()[0]?.options.key).toBe('opencode-live')
    const controller = entries()[0]?.inject?.().controller as CredentialController
    expect(await controller.loadRoute('zen')).toMatchObject({ configured: false, writable: true })
    expect(await controller.save('zen', 'sk-fixture-only', 'OPENCODE_API_KEY')).toMatchObject({ kind: 'saved' })
    expect(values.get('OPENCODE_API_KEY')).toBe('sk-fixture-only')
    expect(controller.state('go')).toMatchObject({ configured: true })
    expect(await controller.remove('zen', 'OPENCODE_API_KEY')).toMatchObject({ kind: 'deleted' })
    expect(values.size).toBe(0)
    expect(controller.state('zen')).toMatchObject({ configured: false })
    expect(controller.state('go')).toMatchObject({ configured: false })
    removeModels?.()
    expect(entries()).toHaveLength(0)
    removeModels = declare()
    expect(entries()).toHaveLength(1)
    await fiber.dispose()
    expect(entries()).toHaveLength(0)
    removeModels()
  })
})

describe('command notice registration', () => {
  it('shows local command results, handles late overlay loading, and disposes its listener', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(await registryPlugin())
    for (const service of ['settingsScope', 'remote', 'remote.credentials']) ctx.provide(service)
    ctx.set('settingsScope', { describe: () => ({ subscribe: () => () => undefined, ensure: async () => undefined, getSnapshot: () => ({ status: 'ready', view: { namespaces: [] } }) }) } as never)
    ctx.set('remote', { credentials: {}, $on: () => () => undefined } as never)
    ctx.set('remote.credentials', ctx.remote.credentials)
    const client = await clientModule<typeof Client>(new URL('../../lib/client.js', import.meta.url))
    const fiber = await ctx.plugin(client)
    const declare = () => ctx.slots.register({
      name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } },
    }, (_props: PropsRenderSlots<'shell.overlay'>) => null)
    let removeOverlay = declare()
    const notice = () => ctx.slots.entriesOfSlot('shell.overlay')[0]?.inject?.().controller as import('../../src/client/command-notice.ts').CommandNoticeController
    const controller = notice()
    expect(controller.getSnapshot()).toBeUndefined()
    ctx.emit('command/executed', 'session-test' as never, 'other-command', { kind: 'error', text: 'unrelated' })
    expect(controller.getSnapshot()).toBeUndefined()
    const text = 'OpenCodeのAPIキーが未設定です。\n1. Settings > Models を開きます。\n2. APIキーを保存してください。'
    ctx.emit('command/executed', 'session-test' as never, 'dsh-opencode', { kind: 'error', text })
    expect(controller.getSnapshot()).toBe(text)
    controller.close()
    expect(controller.getSnapshot()).toBeUndefined()
    ctx.emit('command/executed', 'session-test' as never, 'dsh-opencode', { kind: 'success', text: 'APIキーは保存されています。' })
    expect(controller.getSnapshot()).toContain('保存されています')
    removeOverlay()
    expect(controller.getSnapshot()).toBeUndefined()
    removeOverlay = declare()
    expect(notice().getSnapshot()).toBeUndefined()
    const remounted = notice()
    await fiber.dispose()
    ctx.emit('command/executed', 'session-test' as never, 'dsh-opencode', { kind: 'error', text })
    expect(remounted.getSnapshot()).toBeUndefined()
    expect(ctx.slots.entriesOfSlot('shell.overlay')).toHaveLength(0)
    removeOverlay()
  })
})
