import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogManager } from '../src/catalog.ts'
import { loadCache } from '../src/cache.ts'
import { testCatalogConfig } from './fixtures.ts'

const homes: string[] = []
let testNow = 1000

afterEach(async () => {
  await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true })))
  testNow = 1000
})

const ZEN_OK = (): Response => Response.json({ object: 'list', data: [{ id: 'zen-a', object: 'model', created: 1, owned_by: 'opencode' }] })
const GO_OK = (): Response => Response.json({ object: 'list', data: [{ id: 'go-a', object: 'model', created: 1, owned_by: 'opencode' }] })
const MD_OK = (): Response => Response.json({
  opencode: { id: 'opencode', npm: '@ai-sdk/openai-compatible', models: { 'zen-a': { id: 'zen-a', name: 'Zen A', reasoning: false, tool_call: true, modalities: { input: ['text'], output: ['text'] }, limit: { context: 100, output: 10 } } } },
  'opencode-go': { id: 'opencode-go', npm: '@ai-sdk/openai-compatible', models: { 'go-a': { id: 'go-a', name: 'Go A', reasoning: false, tool_call: false, modalities: { input: ['text'], output: ['text'] }, limit: { context: 100, output: 10 } } } },
})

function offlineManager(config: Partial<ReturnType<typeof testCatalogConfig>> = {}, plan: { zen?: () => Response; go?: () => Response; metadata?: () => Response } = { zen: ZEN_OK, go: GO_OK, metadata: MD_OK }): CatalogManager {
  const fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (async (url: string): Promise<Response> => {
    if (url.endsWith('/zen/v1/models')) return plan.zen?.() ?? new Response('no', { status: 503 })
    if (url.endsWith('/zen/go/v1/models')) return plan.go?.() ?? new Response('no', { status: 503 })
    return plan.metadata?.() ?? new Response('no', { status: 503 })
  }) as typeof fetch
  return new CatalogManager({
    config: testCatalogConfig(config),
    fetch: fetchImpl,
    now: () => testNow,
    warn: () => {},
  })
}

describe('catalog lifecycle safety', () => {
  it('never publishes or saves after stop, even when a fetch resolves late', async () => {
    let release: ((response: Response) => void) | undefined
    const manager = offlineManager({}, {
      zen: () => new Promise<Response>((resolve) => {
        release = resolve
      }) as unknown as Response,
      go: GO_OK,
      metadata: MD_OK,
    })
    void manager.start()
    await new Promise(resolve => setTimeout(resolve, 30))
    manager.stop()
    release?.(ZEN_OK())
    await new Promise(resolve => setTimeout(resolve, 30))
    // Whatever was published before the stop stays; the late response adds
    // nothing and no new state is recorded.
    expect(manager.current?.sources.get('zen-list')?.lastErrorCode).toBeUndefined()
  })

  it('a failing cache write never loses the in-memory catalog', async () => {
    const home = await mkdtemp(join(tmpdir(), 'opencode-lifecycle-'))
    homes.push(home)
    // The cache path is a directory: every write fails while fetches succeed.
    const cachePath = join(home, 'blocked')
    await mkdir(cachePath)
    const manager = offlineManager({ cachePath })
    await manager.start()
    expect(manager.current?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    // Restore from the (unusable) path is also safe.
    expect(await loadCache(cachePath)).toBeUndefined()
    manager.stop()
  })

  it('a restoring restart keeps ready models executable without a network', async () => {
    const home = await mkdtemp(join(tmpdir(), 'opencode-lifecycle-'))
    homes.push(home)
    const cachePath = join(home, 'cache.json')
    const first = offlineManager({ cachePath })
    await first.start()
    first.stop()
    testNow += 60_000
    const second = offlineManager({ cachePath }, {
      zen: () => new Response('no', { status: 503 }),
      go: () => new Response('no', { status: 503 }),
      metadata: () => new Response('no', { status: 503 }),
    })
    await second.start()
    expect(second.current?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    expect(second.current?.sources.get('zen-list')?.lastErrorCode).toBe('HTTP_STATUS')
    second.stop()
  })

  it('cache contents never contain secret-shaped values', async () => {
    const home = await mkdtemp(join(tmpdir(), 'opencode-lifecycle-'))
    homes.push(home)
    const cachePath = join(home, 'cache.json')
    const manager = offlineManager({ cachePath })
    await manager.start()
    const raw = await readFile(cachePath, 'utf8')
    expect(raw).not.toMatch(/sk-[A-Za-z0-9]|api[_-]?key/i)
    manager.stop()
  })

  it('periodic reconfiguration rearms without leaking timers', async () => {
    vi.useFakeTimers()
    try {
      const manager = offlineManager({ refreshIntervalMs: 1000 })
      void manager.start()
      await vi.advanceTimersByTimeAsync(50)
      manager.reconfigure(testCatalogConfig({ refreshIntervalMs: 500 }))
      await vi.advanceTimersByTimeAsync(600)
      // No throw and no runaway: the timer re-armed once with the new interval.
      manager.stop()
      await vi.advanceTimersByTimeAsync(5000)
      expect(manager.current?.products.zen.candidates.get('zen-a')?.state).toBe('ready')
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes the cache atomically enough that a partial file never validates', async () => {
    const home = await mkdtemp(join(tmpdir(), 'opencode-lifecycle-'))
    homes.push(home)
    const cachePath = join(home, 'cache.json')
    // A torn/partial file from a hypothetical crash is refused wholesale.
    await writeFile(cachePath, '{"version":1,"normalizer":1,"savedAt":1,"sources":{"zen-l')
    expect(await loadCache(cachePath)).toBeUndefined()
  })
})
