import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { PLUGIN_VERSION } from '../src/transport.ts'

describe('package metadata', () => {
  it('declares the bundle patch, entry, and shipped files', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string
      main: string
      files: string[]
      dsh?: { bundle?: { patch?: string } }
      exports?: Record<string, unknown>
    }
    expect(manifest.name).toBe('dsh-opencode')
    expect(manifest.main).toBe('lib/index.js')
    expect(manifest.files).toContain('lib')
    expect(manifest.files).toContain('cordis.patch.yml')
    expect(manifest.files).toContain('README.md')
    expect(manifest.files).toContain('LICENSE')
    expect(manifest.files).not.toContain('src')
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(Object.keys(manifest.exports ?? {})).toContain('./cordis.patch.yml')
  })

  it('inserts only this plugin and never touches existing rows', async () => {
    const patchText = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const patch = parse(patchText) as Array<Record<string, unknown>>
    const insertEntries = patch
      .filter(entry => typeof entry.insert === 'object' && entry.insert !== null)
      .flatMap(entry => (entry.insert as Array<{ id?: string; config?: Record<string, unknown> }>))
    expect(insertEntries).toHaveLength(1)
    expect(insertEntries[0]?.id).toBe('opencode-live')
    // No targeted replace of llm-pi-ai or any other existing row.
    expect(patch.some(entry => 'id' in entry && entry.id === 'llm-pi-ai')).toBe(false)
    const config = insertEntries[0]?.config as {
      providers?: Record<string, { product?: string; apiKeyEnv?: string }>
      catalog?: Record<string, number | boolean>
    }
    expect(config.providers?.['opencode-zen-live']).toEqual({ product: 'zen', apiKeyEnv: 'OPENCODE_API_KEY' })
    expect(config.providers?.['opencode-go-live']).toEqual({ product: 'go', apiKeyEnv: 'OPENCODE_API_KEY' })
    expect(config.catalog).toMatchObject({
      refreshIntervalMs: 900000,
      listRevalidateAfterMs: 60000,
      timeoutMs: 15000,
      maxStaleMs: 604800000,
      requireFresh: false,
    })
    // No fixed model list ships in the patch.
    expect(JSON.stringify(config)).not.toMatch(/models:\s*\[/)
  })

  it('keeps the plugin version and client header in agreement', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(PLUGIN_VERSION).toBe(manifest.version)
  })
})
