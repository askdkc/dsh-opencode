/**
 * Shared deterministic fixtures for the offline tests: minimal official
 * list responses and Models.dev provider slices in the exact published
 * shapes, plus a catalog configuration helper.
 *
 * @module tests/fixtures
 */

import type { CatalogConfig } from '../src/catalog.ts'

/** One official list entry as the product API publishes it. */
export interface FixtureEntry {
  id: string
  object: string
  created: number
  owned_by: string
}

/** Build an official `/models` body. */
export function officialList(entries: FixtureEntry[]): unknown {
  return { object: 'list', data: entries }
}

/** One Models.dev model entry, as api.json publishes it. */
export interface MetadataFixture {
  id: string
  name: string
  reasoning?: boolean
  reasoning_options?: Array<{ type: string; values?: string[] }>
  tool_call?: boolean
  modalities?: { input: string[]; output: string[] }
  limit?: { context: number; output: number }
  provider?: { npm: string }
  cost?: { input: number; output: number; cache_read: number; cache_write: number }
}

/** Build a Models.dev `api.json` body for the two OpenCode providers. */
export function modelsDevBody(
  opencode: Record<string, MetadataFixture>,
  opencodeGo: Record<string, MetadataFixture>,
  defaults: { opencode?: string; 'opencode-go'?: string } = {},
): unknown {
  return {
    opencode: {
      id: 'opencode',
      npm: defaults.opencode ?? '@ai-sdk/openai-compatible',
      api: 'https://opencode.ai/zen/v1',
      env: ['OPENCODE_API_KEY'],
      name: 'OpenCode Zen',
      models: opencode,
    },
    'opencode-go': {
      id: 'opencode-go',
      npm: defaults['opencode-go'] ?? '@ai-sdk/openai-compatible',
      api: 'https://opencode.ai/zen/go/v1',
      env: ['OPENCODE_API_KEY'],
      name: 'OpenCode Go',
      models: opencodeGo,
    },
  }
}

/** One complete valid model fixture. */
export function completeModel(id: string, npm: string, overrides: Partial<Omit<MetadataFixture, 'id' | 'name'>> = {}): MetadataFixture {
  return {
    id,
    name: `Model ${id}`,
    reasoning: true,
    tool_call: true,
    modalities: { input: ['text', 'image'], output: ['text'] },
    limit: { context: 200000, output: 64000 },
    provider: { npm },
    cost: { input: 1, output: 2, cache_read: 0.1, cache_write: 1.25 },
    ...overrides,
  }
}

/** Build a Models.dev metadata fixture bundle. */
export function metadataFixtures(
  models: Record<string, MetadataFixture>,
): Record<string, MetadataFixture> {
  return models
}

/** Default catalog configuration for tests. */
export function testCatalogConfig(overrides: Partial<CatalogConfig> = {}): CatalogConfig {
  return {
    refreshIntervalMs: 900000,
    listRevalidateAfterMs: 60000,
    timeoutMs: 1000,
    maxStaleMs: 604800000,
    requireFresh: false,
    ...overrides,
  }
}
