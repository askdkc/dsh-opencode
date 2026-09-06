import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogManager } from '../src/catalog.ts'
import { loadCache } from '../src/cache.ts'
import { completeModel, metadataFixtures, modelsDevBody, officialList, testCatalogConfig } from './fixtures.ts'

const homes: string[] = []

afterEach(async () => {
  await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true })))
})

interface RoutePlan {
  zen?: () => Response
  go?: () => Response
  metadata?: () => Response
}

/** Build a fetch fake with per-URL call recording. */
function fakeFetch(plan: RoutePlan): { fetch: (url: string, init?: RequestInit) => Promise<Response>; calls: string[] } {
  const calls: string[] = []
  const fetch = vi.fn(async (url: string): Promise<Response> => {
    calls.push(url)
    if (url.endsWith('/zen/v1/models')) return plan.zen?.() ?? new Response('nope', { status: 500 })
    if (url.endsWith('/zen/go/v1/models')) return plan.go?.() ?? new Response('nope', { status: 500 })
    if (url.endsWith('/api.json')) return plan.metadata?.() ?? new Response('nope', { status: 500 })
    throw new Error(`unexpected url ${url}`)
  })
  return { fetch, calls }
}

function zenBody(ids: string[]): Response {
  return Response.json(officialList(ids.map(id => ({ id, object: 'model', created: 1, owned_by: 'opencode' }))), {
    headers: { etag: 'W/"zen-1"' },
  })
}

function goBody(ids: string[]): Response {
  return Response.json(officialList(ids.map(id => ({ id, object: 'model', created: 1, owned_by: 'opencode' }))))
}

function metadataBody(): Response {
  return Response.json(modelsDevBody(metadataFixtures({
    'zen-a': completeModel('zen-a', '@ai-sdk/anthropic'),
  }), metadataFixtures({
    'go-a': completeModel('go-a', '@ai-sdk/openai'),
  })), { headers: { etag: 'W/"md-1"' } })
}

let testNow = 1000

function newManager(plan: RoutePlan, config: Partial<ReturnType<typeof testCatalogConfig>> = {}): { manager: CatalogManager; calls: string[] } {
  const { fetch, calls } = fakeFetch(plan)
  const manager = new CatalogManager({
    config: testCatalogConfig(config),
    fetch,
    now: () => testNow,
    warn: () => {},
  })
  return { manager, calls }
}

describe('CatalogManager refresh', () => {
  it('publishes ready models from a full successful fetch', async () => {
    const { manager } = newManager({
      zen: () => zenBody(['zen-a']),
      go: () => goBody(['go-a']),
      metadata: metadataBody,
    })
    await manager.start()
    const snapshot = manager.current
    expect(snapshot).toBeDefined()
    expect(snapshot?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    expect(snapshot?.products.go.candidates.get('go-a')?.state).toBe('ready')
    manager.stop()
  })

  it('fetches Models.dev once for both products and single-flights concurrent refreshes', async () => {
    const { manager, calls } = newManager({
      zen: () => zenBody(['zen-a']),
      go: () => goBody(['go-a']),
      metadata: metadataBody,
    })
    await manager.start()
    const metadataCalls = calls.filter(url => url.endsWith('/api.json')).length
    expect(metadataCalls).toBe(1)
    await Promise.all([manager.refresh(), manager.refresh(), manager.refresh()])
    const metadataAfter = calls.filter(url => url.endsWith('/api.json')).length
    expect(metadataAfter).toBe(2) // start + one coalesced refresh
    manager.stop()
  })

  it('treats a 304 as a successful revalidation without replacing payloads', async () => {
    let zenCalls = 0
    const { manager } = newManager({
      zen: () => {
        zenCalls += 1
        return zenCalls === 1 ? zenBody(['zen-a']) : new Response(null, { status: 304 })
      },
      go: () => goBody(['go-a']),
      metadata: metadataBody,
    })
    await manager.start()
    expect(manager.current?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    testNow += 120000
    await manager.refresh()
    expect(manager.current?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    expect(manager.current?.sources.get('zen-list')?.lastSuccessfulAt).toBe(testNow)
    manager.stop()
  })

  it('keeps the previous set when a fresh fetch returns an empty list', async () => {
    let zenCalls = 0
    const { manager } = newManager({
      zen: () => {
        zenCalls += 1
        return zenCalls === 1 ? zenBody(['zen-a']) : Response.json({ object: 'list', data: [] })
      },
      go: () => goBody(['go-a']),
      metadata: metadataBody,
    })
    await manager.start()
    expect(manager.current?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    testNow += 120000
    await manager.refresh()
    expect(manager.current?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    expect(manager.current?.sources.get('zen-list')?.lastErrorCode).toBe('EMPTY_LIST')
    manager.stop()
  })

  it('a Zen failure does not block the Go publication', async () => {
    const { manager } = newManager({
      zen: () => new Response('<html>503</html>', { status: 503, headers: { 'content-type': 'text/html' } }),
      go: () => goBody(['go-a']),
      metadata: metadataBody,
    })
    await manager.start()
    expect(manager.current?.sources.get('zen-list')?.lastErrorCode).toBe('HTTP_STATUS')
    expect(manager.current?.products.go.candidates.get('go-a')?.state).toBe('ready')
    manager.stop()
  })

  it('a failed metadata source keeps known matching data and holds new candidates', async () => {
    let metadataCalls = 0
    const { manager } = newManager({
      zen: () => zenBody(['zen-a', 'zen-new']),
      go: () => goBody(['go-a']),
      metadata: () => {
        metadataCalls += 1
        return metadataCalls === 1
          ? metadataBody()
          : new Response('<html>gateway error</html>', { status: 200, headers: { 'content-type': 'text/html' } })
      },
    })
    await manager.start()
    expect(manager.current?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    testNow += 120000
    await manager.refresh()
    // The previously confirmed model keeps its metadata (stale freshness);
    // the brand-new id stays pending because no metadata ever landed.
    expect(manager.current?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    expect(manager.current?.products.zen.candidates.get('zen-new')?.state).toBe('metadata-pending')
    expect(manager.current?.sources.get('models-dev')?.lastErrorCode).toBe('INVALID_JSON')
    manager.stop()
  })

  it('gives distinct bounded outcomes to malformed, oversized, and timed-out bodies', async () => {
    const { manager } = newManager({
      zen: () => new Response('<html>ok</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      go: () => new Response('{"object":"list","data":', { status: 200, headers: { 'content-type': 'application/json' } }),
      metadata: () => new Response('{"huge":', { status: 200 }),
    }, { timeoutMs: 50 })
    await manager.start()
    expect(manager.current?.sources.get('zen-list')?.lastErrorCode).toBe('INVALID_JSON')
    expect(manager.current?.sources.get('go-list')?.lastErrorCode).toBe('INVALID_JSON')
    expect(manager.current?.sources.get('models-dev')?.lastErrorCode).toBe('INVALID_JSON')
    manager.stop()
  })

  it('persists validated payloads and restores them on the next start', async () => {
    const home = await mkdtemp(join(tmpdir(), 'opencode-cache-'))
    homes.push(home)
    const cachePath = join(home, 'catalog.json')
    const { manager } = newManager({
      zen: () => new Response('nope', { status: 503 }),
      go: () => new Response('nope', { status: 503 }),
      metadata: () => new Response('nope', { status: 503 }),
    }, { cachePath })
    // First instance: successful fetch from an all-succeeding plan.
    const ok = newManager({
      zen: () => zenBody(['zen-a']),
      go: () => goBody(['go-a']),
      metadata: metadataBody,
    }, { cachePath })
    await ok.manager.start()
    ok.manager.stop()
    // Everything now fails; the restored cache must still publish ready models.
    testNow += 1000
    await manager.start()
    expect(manager.current?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    expect(manager.current?.products.go.candidates.get('go-a')?.state).toBe('ready')
    manager.stop()
    const cached = await loadCache(cachePath)
    expect(cached?.zenList?.ids).toEqual(['zen-a'])
    expect(await readFile(cachePath, 'utf8')).not.toContain('secret')
  })

  it('refuses a foreign cache file wholesale', async () => {
    const home = await mkdtemp(join(tmpdir(), 'opencode-cache-'))
    homes.push(home)
    const cachePath = join(home, 'catalog.json')
    await rm(cachePath, { force: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(cachePath, JSON.stringify({ version: 99, normalizer: 99, sources: {} }))
    const { manager } = newManager({
      zen: () => zenBody(['zen-a']),
      go: () => goBody(['go-a']),
      metadata: metadataBody,
    }, { cachePath })
    await manager.start()
    expect(manager.current?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    manager.stop()
  })

  it('stops timers and forbids late completions from publishing', async () => {
    let releaseZen: ((response: Response) => void) | undefined
    const { manager } = newManager({
      zen: () => new Promise<Response>((resolve) => {
        releaseZen = resolve
      }) as unknown as Response,
      go: () => goBody(['go-a']),
      metadata: metadataBody,
    })
    void manager.start()
    await new Promise(resolve => setTimeout(resolve, 20))
    manager.stop()
    releaseZen?.(zenBody(['late-model']))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(manager.current?.products.zen.candidates.has('late-model')).toBe(false)
  })
})
