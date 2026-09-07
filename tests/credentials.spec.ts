import { describe, expect, it } from 'vitest'
import { apiKeyOnlyAuth, resolveApiKeyFor, staticAuthBridge } from '../src/credentials.ts'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { Context } from '@deepseek-ai/cordis'

/** Build a minimal fake plugin context with the given credential service. */
function fakeCtx(credentials: { resolve: (ref: CredentialRef) => Promise<{ value: string; source: string } | undefined> } | undefined): Context {
  return {
    get: (name: string) => name === 'credentials' ? credentials : undefined,
  } as unknown as Context
}

/** A minimal-but-valid resolved profile shape for the resolver. */
function profileWith(ref: string): ResolvedPiAiProviderProfile {
  return {
    provider: 'opencode-go-live',
    displayName: 'OpenCode Go (Live)',
    apiKeyEnv: ref as CredentialRef,
    streamIdleTimeoutMs: 300000,
    maxRequestImageBytes: 1,
    requestImagePixelBudget: 1,
    requestImageMaxBytes: 1,
    retryPolicy: { mode: 'normal', maxRetries: 0, retryableCodes: ['SERVER'], initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 },
    configuredMaxTokens: new Map(),
    piProvider: {
      id: 'opencode-go-live',
      name: 'x',
      auth: {},
      getModels: () => [],
      stream: () => { throw new Error('unused') },
      streamSimple: () => { throw new Error('unused') },
    },
  }
}

describe('resolveApiKeyFor', () => {
  it('returns the validated key for a configured reference', async () => {
    const ctx = fakeCtx({
      resolve: async () => ({ value: '  sk-test-123  ', source: 'env' }),
    })
    const key = await resolveApiKeyFor(ctx, 'opencode-go-live', profileWith('OPENCODE_API_KEY'))
    expect(key).toBe('sk-test-123')
  })

  it('fails loudly with MISSING_CREDENTIAL and never leaks the value', async () => {
    const ctx = fakeCtx({ resolve: async () => undefined })
    await expect(resolveApiKeyFor(ctx, 'opencode-go-live', profileWith('OPENCODE_API_KEY')))
      .rejects.toMatchObject({ code: 'MISSING_CREDENTIAL', message: expect.stringContaining('Settings > Models') })
    try {
      await resolveApiKeyFor(ctx, 'opencode-live', profileWith('OPENCODE_API_KEY'))
    } catch (error) {
      expect(String((error as Error).message)).not.toContain('sk-')
    }
  })

  it('refuses an unusable key instead of sending it', async () => {
    const ctx = fakeCtx({ resolve: async () => ({ value: 'bad\tkey\nvalue', source: 'env' }) })
    await expect(resolveApiKeyFor(ctx, 'opencode-go-live', profileWith('OPENCODE_API_KEY')))
      .rejects.toMatchObject({ code: expect.any(String) })
  })

  it.each(['ja', 'en'])('keeps the missing-key error actionable in %s', async preference => {
    const ctx = {
      get: (name: string) => name === 'credentials' ? { resolve: async () => undefined }
        : name === 'settings' ? { get: () => ({ preference }) } : undefined,
    } as unknown as Context
    await expect(resolveApiKeyFor(ctx, 'opencode-go-live', profileWith('OPENCODE_API_KEY')))
      .rejects.toMatchObject({
        code: 'MISSING_CREDENTIAL',
        message: expect.stringContaining(preference === 'ja' ? '「APIキーを保存」' : '"Save API key"'),
      })
  })
})

describe('apiKeyOnlyAuth', () => {
  it('resolves from the request credential alone, never ambient names', async () => {
    const auth = apiKeyOnlyAuth('OpenCode Go (Live)')
    const fromCredential = await auth.resolve({ ctx: undefined as never, credential: { type: 'api_key', key: 'stored' } } as never)
    expect(fromCredential).toEqual({ auth: { apiKey: 'stored' }, source: 'OpenCode Go (Live)' })
    const unconfigured = await (auth.resolve({ ctx: undefined as never, credential: undefined } as never))
    expect(unconfigured).toEqual({ auth: {}, source: 'OpenCode Go (Live)' })
  })
})

describe('staticAuthBridge', () => {
  it('refuses credential writes, answers nothing ambiently, and never exposes values', async () => {
    const bridge = staticAuthBridge()
    await expect(bridge.credentials.read('opencode-go-live')).resolves.toBeUndefined()
    await expect(bridge.credentials.list()).resolves.toEqual([])
    await expect(bridge.credentials.modify('opencode-go-live', async () => undefined))
      .rejects.toMatchObject({ code: 'NO_CREDENTIAL_STORE' })
    await expect(bridge.credentials.delete('opencode-go-live')).resolves.toBeUndefined()
    await expect(bridge.authContext.env('OPENAI_API_KEY')).resolves.toBeUndefined()
    await expect(bridge.authContext.fileExists('~/.aws/credentials')).resolves.toBe(false)
  })

  it('is stable across calls so collection rebuilds share one bridge', () => {
    const first = staticAuthBridge()
    const second = staticAuthBridge()
    expect(Object.keys(first)).toEqual(Object.keys(second))
  })
})

describe('fakeCtx helper contract', () => {
  it('exposes the credentials service through ctx.get', async () => {
    const ctx = fakeCtx({ resolve: async () => ({ value: 'k', source: 'env' }) })
    const hit = await (ctx.get('credentials') as { resolve: (ref: CredentialRef) => Promise<{ value: string } | undefined> }).resolve('OPENCODE_API_KEY' as CredentialRef)
    expect(hit?.value).toBe('k')
  })
})

describe('LlmError', () => {
  it('is importable and carries a code', () => {
    expect(new LlmError('x', 'C').code).toBe('C')
  })
})
