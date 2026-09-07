/**
 * The key store and its no-stray-change proof.
 *
 * These cover the part the user asked for directly: a pre-made write script
 * that puts a key where DSH stores OpenCode credentials, and a verification
 * that a key store changed nothing else — no settings section edit, no
 * unrelated credential reference.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveConfig } from '../src/config.ts'
import type { ResolvedProviderConfig } from '../src/config.ts'
import {
  keyConfigured, keyReadonly, snapshotKeyring, storeApiKey, verifyNoStrayChange,
} from '../src/keyring.ts'

/** The resolved provider profiles for the two fixed live routes. */
function providers(overrides: Partial<Record<'opencode-zen-live' | 'opencode-go-live', Partial<ResolvedProviderConfig>>> = {}): ResolvedProviderConfig[] {
  const resolved = resolveConfig({
    providers: {
      'opencode-zen-live': { product: 'zen', apiKeyEnv: 'OPENCODE_API_KEY' },
      'opencode-go-live': { product: 'go', apiKeyEnv: 'OPENCODE_API_KEY' },
    },
  })
  return [...resolved.providers.values()].map(profile =>
    overrides[profile.route as 'opencode-zen-live'] === undefined
      ? profile
      : { ...profile, ...overrides[profile.route as 'opencode-zen-live'] })
}

/** An in-memory credential service that records writes and reports presence. */
function credentialStore(initial: Record<string, string> = {}) {
  const set = vi.fn(async (ref: CredentialRef, value: string) => {
    if (value.length === 0) throw new Error('empty key refused')
    initial[ref] = value
  })
  const describe = vi.fn(async (ref: CredentialRef) => ({
    configured: initial[ref] !== undefined,
    writable: true,
  }))
  return {
    set,
    describe,
    service: { describe, set, unset: vi.fn() },
  }
}

/** A settings service that only answers `get('opencode-live')`. */
function settingsService(section: unknown) {
  return { get: vi.fn(() => section) }
}

/** Build the fake plugin context with the injected services. */
function ctxWith(services: {
  credentials?: { describe: unknown; set: unknown; unset: unknown }
  settings?: { get: (ns: string) => unknown }
}): Context {
  const ctx = { get: (name: string) => (name === 'credentials' ? services.credentials : name === 'settings' ? services.settings : undefined) } as unknown as Context
  return ctx
}

describe('opencode-live keyring', () => {
  it('stores a key under the configured reference and reports success', async () => {
    const credentials = credentialStore()
    const ctx = ctxWith({ credentials: credentials.service, settings: settingsService({ providers: {} }) })
    const failure = await storeApiKey(ctx, providers(), 'sk-abcd')
    expect(failure).toBeUndefined()
    expect(credentials.set).toHaveBeenCalledWith('OPENCODE_API_KEY', 'sk-abcd')
  })

  it('materializes a production Map.values iterator before writing', async () => {
    const credentials = credentialStore()
    const ctx = ctxWith({ credentials: credentials.service, settings: settingsService({ providers: {} }) })
    const resolved = resolveConfig({})
    const failure = await storeApiKey(ctx, resolved.providers.values(), 'sk-iterator')
    expect(failure).toBeUndefined()
    expect(credentials.set).toHaveBeenCalledTimes(1)
    expect(credentials.set).toHaveBeenCalledWith('OPENCODE_API_KEY', 'sk-iterator')
    expect((await credentials.service.describe(credentialRef('OPENCODE_API_KEY'))).configured).toBe(true)
  })

  it('writes to every distinct configured reference', async () => {
    const credentials = credentialStore()
    const ctx = ctxWith({ credentials: credentials.service, settings: settingsService({ providers: {} }) })
    await storeApiKey(ctx, providers({ 'opencode-go-live': { apiKeyEnv: credentialRef('OPENCODE_GO_API_KEY') } }), 'sk-abcd')
    expect(credentials.set).toHaveBeenCalledWith('OPENCODE_API_KEY', 'sk-abcd')
    expect(credentials.set).toHaveBeenCalledWith('OPENCODE_GO_API_KEY', 'sk-abcd')
  })

  it('rejects an unusable key before writing anything', async () => {
    const credentials = credentialStore()
    const ctx = ctxWith({ credentials: credentials.service, settings: settingsService({ providers: {} }) })
    const failure = await storeApiKey(ctx, providers(), 'sk\nnewline')
    expect(failure).toBeTruthy()
    expect(credentials.set).not.toHaveBeenCalled()
  })

  it('verifies the settings section is unchanged after a store', async () => {
    const section = { providers: { 'opencode-zen-live': { product: 'zen', apiKeyEnv: 'OPENCODE_API_KEY' } } }
    const settings = settingsService(section)
    const credentials = credentialStore()
    const ctx = ctxWith({ credentials: credentials.service, settings })
    await storeApiKey(ctx, providers(), 'sk-abcd')
    // The settings 'get' was read for the snapshot, but never written.
    expect(settings.get).toHaveBeenCalledWith('opencode-live')
    // Read once before and once after the store; the section itself never
    // changes, so both reads agree and the store reports success.
    expect(settings.get).toHaveBeenCalledTimes(2)
  })

  it('fails a store when an unrelated credential reference moved', async () => {
    const before = await snapshotKeyring(
      ctxWith({ credentials: credentialStore().service, settings: settingsService({}) }),
      providers(),
    )
    const after = {
      ...before,
      refs: new Map([...before.refs, [credentialRef('SOME_OTHER_KEY'), { configured: true, writable: true }]]),
    }
    const stray = verifyNoStrayChange(before, after, [credentialRef('OPENCODE_API_KEY')])
    expect(stray).toBeTruthy()
    expect(stray).toContain('unrelated credential reference')
  })

  it('reports configured and read-only state presence-only', async () => {
    const credentials = credentialStore({ OPENCODE_API_KEY: 'sk-abc' })
    const ctx = ctxWith({ credentials: credentials.service, settings: settingsService({}) })
    expect(await keyConfigured(ctx, providers())).toBe(true)
    expect(await keyReadonly(ctx, providers())).toBe(false)
  })
})
