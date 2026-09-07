import { describe, expect, it } from 'vitest'
import { DEFAULT_API_KEY_ENV, DEFAULT_PROVIDERS, resolveConfig } from '../src/config.ts'

describe('settings defaults', () => {
  it('publishes both default provider profiles with the shared credential reference', () => {
    const resolved = resolveConfig({})
    expect(DEFAULT_PROVIDERS['opencode-zen-live']?.apiKeyEnv).toBe(DEFAULT_API_KEY_ENV)
    expect(resolved.providers.get('opencode-zen-live')?.apiKeyEnv).toBe(DEFAULT_API_KEY_ENV)
    expect(resolved.providers.get('opencode-go-live')?.apiKeyEnv).toBe(DEFAULT_API_KEY_ENV)
  })

  it('preserves an explicit single-route and custom reference', () => {
    const resolved = resolveConfig({ providers: { 'opencode-zen-live': { product: 'zen', apiKeyEnv: 'ZEN_KEY' } } })
    expect(resolved.providers.size).toBe(1)
    expect(resolved.providers.get('opencode-zen-live')?.apiKeyEnv).toBe('ZEN_KEY')
  })
})
