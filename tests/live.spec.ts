/**
 * Explicitly opt-in live API checks. These never run in normal CI: they need
 * `OPENCODE_LIVE_TESTS=1`, hit the public catalog GET endpoints only, send no
 * credentials anywhere, and stop short of any inference request (no API key
 * is required for a model listing, and no billed call is ever made).
 */
import { describe, expect, it } from 'vitest'

const enabled = process.env.OPENCODE_LIVE_TESTS === '1'
const d = enabled ? describe : describe.skip

d('live catalog contract (opt-in)', () => {
  it('lists models on both official endpoints and models.dev', async () => {
    const zen = await fetch('https://opencode.ai/zen/v1/models')
    expect(zen.ok).toBe(true)
    const zenBody = await zen.json() as { object?: string; data?: Array<{ id?: unknown }> }
    expect(zenBody.object).toBe('list')
    expect(zenBody.data?.length ?? 0).toBeGreaterThan(0)

    const go = await fetch('https://opencode.ai/zen/go/v1/models')
    expect(go.ok).toBe(true)
    const goBody = await go.json() as { object?: string; data?: Array<{ id?: unknown }> }
    expect(goBody.object).toBe('list')
    expect(goBody.data?.length ?? 0).toBeGreaterThan(0)

    const metadata = await fetch('https://models.dev/api.json')
    expect(metadata.ok).toBe(true)
    const providers = await metadata.json() as Record<string, { models?: unknown }>
    expect(providers.opencode?.models).toBeDefined()
    expect(providers['opencode-go']?.models).toBeDefined()
  })

  it('catalog endpoints accept unauthenticated requests without leaking a key', async () => {
    const response = await fetch('https://opencode.ai/zen/v1/models', { headers: { accept: 'application/json' } })
    const text = await response.text()
    expect(response.ok).toBe(true)
    expect(text.toLowerCase()).not.toContain('unauthorized')
  })
})
