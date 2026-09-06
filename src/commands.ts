/**
 * The host commands this plugin registers.
 *
 * `/opencode-refresh` forces a catalog refresh, `/opencode-status` reports
 * source freshness and counts, and `/opencode-models` lists a product's
 * models, including the non-ready ones with their reasons under `--all`.
 *
 * `/dsh-opencode` is the quick-configure entry point: pass the API key as its
 * single argument to store it securely and enable both routes immediately, or
 * run it with no argument to check status. None of these commands displays
 * secret values, and every handler sets `recordInput: false` so arguments are
 * not duplicated into session logs — the key is written through the DSH
 * credential seam, never echoed back.
 *
 * @module opencode-live/commands
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import type { CatalogManager } from './catalog.ts'
import type { ResolvedPluginConfig } from './config.ts'
import type { CredentialFacts } from './credentials.ts'
import type { CatalogModel, Product, RouteId } from './normalize.ts'
import { PRODUCT_BY_ROUTE, ROUTE_BY_PRODUCT } from './normalize.ts'
import { describeNonReadyState } from './normalize.ts'

/** Services the command handlers read. */
export interface CommandServices {
  readonly catalog: CatalogManager
  readonly config: () => ResolvedPluginConfig
  /** Presence-only credential facts for one route's reference. */
  readonly describeCredential: (route: RouteId) => Promise<CredentialFacts | undefined>
  /** Store a key for one credential reference (quick configure). */
  readonly storeCredential: (ref: CredentialRef, value: string) => Promise<void>
}

const USAGE_REFRESH = 'Usage: /opencode-refresh [all|zen|go]'
const USAGE_MODELS = 'Usage: /opencode-models <zen|go> [--all]'
const USAGE_ENABLE = 'Usage: /dsh-opencode [<api-key>] — pass the key to store it and enable immediately, or omit it to check status'

/** Whether one date stamp renders as a short local time. */
function renderTime(timestamp: number | undefined): string {
  if (timestamp === undefined) return 'never'
  return new Date(timestamp).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** One product's status lines. */
async function productStatus(ctx: Context, services: CommandServices, product: Product): Promise<string> {
  const route = ROUTE_BY_PRODUCT[product]
  const view = services.catalog.current?.products[product]
  const facts = await services.describeCredential(route)
  const lines = [
    `${route} (${product}):`,
    `  credential: ${facts === undefined ? 'unknown (no credentials service)' : facts.configured ? 'configured' : 'not configured'}`,
    `  models ready: ${view?.counts.ready ?? 0}, pending: ${(view?.counts['metadata-pending'] ?? 0) + (view?.counts['unsupported-protocol'] ?? 0)}, catalog-only: ${view?.counts['catalog-only'] ?? 0}, removed: ${view?.counts.removed ?? 0}`,
  ]
  if (view !== undefined) {
    lines.push(`  official list: ${view.officialConfirmed ? (view.stale ? 'stale' : 'fresh') : 'never confirmed'}, last success ${renderTime(services.catalog.current?.sources.get(product === 'zen' ? 'zen-list' : 'go-list')?.lastSuccessfulAt)}`)
  }
  const sources = services.catalog.current?.sources
  if (sources !== undefined) {
    for (const [id, state] of sources) {
      if (state.lastErrorCode !== undefined) {
        lines.push(`  ${id}: last error ${state.lastErrorCode} at ${renderTime(state.lastCheckedAt)}`)
      }
    }
  }
  return lines.join('\n')
}

/** One candidate's display line for the models listing. */
function candidateLine(candidate: CatalogModel, all: boolean): string {
  if (candidate.state === 'ready' && !all) {
    return `  ${candidate.id} — ${candidate.name}${candidate.api === undefined ? '' : ` [${candidate.api}]`}`
  }
  if (!all) return ''
  const detail = candidate.state === 'ready'
    ? `ready [${candidate.api ?? 'unknown'}]`
    : describeNonReadyState(candidate)
  return `  ${candidate.id} — ${candidate.name} (${detail})`
}

/** Parse one product argument. */
function parseProduct(raw: string): Product | undefined {
  if (raw === 'zen') return 'zen'
  if (raw === 'go') return 'go'
  return undefined
}

/** Distinct credential references across the configured routes. */
function configuredRefs(services: CommandServices): CredentialRef[] {
  return [...new Set([...services.config().providers.values()].map(provider => provider.apiKeyEnv))]
}

/** Build the three command definitions. */
export function commandDefinitions(ctx: Context, services: CommandServices): CommandDefinition[] {
  return [
    {
      name: 'opencode-refresh',
      description: 'Refresh the OpenCode Zen/Go model catalogs',
      recordInput: false,
      handler: async (invocation: CommandInvocation): Promise<CommandResult> => {
        const arg = invocation.rawInput.trim()
        const products = arg === '' || arg === 'all'
          ? ['zen' as const, 'go' as const]
          : parseProduct(arg) !== undefined ? [parseProduct(arg) as Product] : undefined
        if (products === undefined) return { kind: 'error', text: USAGE_REFRESH }
        if (invocation.signal.aborted) return { kind: 'success', text: 'Refresh cancelled.' }
        try {
          await services.catalog.refresh({ products, signal: invocation.signal })
        } catch {
          // The catalog keeps serving its last good snapshot; per-source
          // errors are visible through /opencode-status rather than failing
          // the command wholesale.
        }
        const lines: string[] = ['Catalog refresh finished.']
        for (const product of products) lines.push(await productStatus(ctx, services, product))
        return { kind: 'success', text: lines.join('\n') }
      },
    },
    {
      name: 'opencode-status',
      description: 'Show OpenCode live catalog and credential status',
      recordInput: false,
      handler: async (invocation: CommandInvocation): Promise<CommandResult> => {
        if (invocation.rawInput.trim().length > 0) return { kind: 'error', text: 'Usage: /opencode-status' }
        const lines = ['OpenCode live catalog status:']
        lines.push(await productStatus(ctx, services, 'zen'))
        lines.push(await productStatus(ctx, services, 'go'))
        const metadata = services.catalog.current?.sources.get('models-dev')
        if (metadata !== undefined) {
          lines.push(`models.dev metadata: last success ${renderTime(metadata.lastSuccessfulAt)}${metadata.lastErrorCode === undefined ? '' : `, last error ${metadata.lastErrorCode}`}`)
        }
        return { kind: 'success', text: lines.join('\n') }
      },
    },
    {
      name: 'opencode-models',
      description: 'List OpenCode live models, including non-ready candidates with --all',
      recordInput: false,
      handler: async (invocation: CommandInvocation): Promise<CommandResult> => {
        const parts = invocation.rawInput.trim().split(/\s+/).filter(part => part.length > 0)
        if (parts.length === 0 || parts.length > 2) return { kind: 'error', text: USAGE_MODELS }
        const product = parseProduct(parts[0] as string)
        if (product === undefined) return { kind: 'error', text: USAGE_MODELS }
        const all = parts[1] === '--all'
        if (!all && parts.length === 2) return { kind: 'error', text: USAGE_MODELS }
        const snapshot = services.catalog.current
        if (snapshot === undefined) {
          return { kind: 'success', text: `No catalog data for "${product}" yet; try /opencode-refresh ${product}.` }
        }
        const view = snapshot.products[product]
        const lines = [
          `${ROUTE_BY_PRODUCT[product]} (${product})${all ? ' — all candidates' : ` — ${view.counts.ready} ready models`}:`,
        ]
        const ordered = [...view.candidates.values()].sort((left, right) => left.id.localeCompare(right.id))
        for (const candidate of ordered) {
          const line = candidateLine(candidate, all)
          if (line.length > 0) lines.push(line)
        }
        if (all && view.counts.ready === 0 && ordered.length === 0) {
          lines.push('  (no candidates published yet)')
        }
        return { kind: 'success', text: lines.join('\n') }
      },
    },
    {
      name: 'dsh-opencode',
      description: 'Store the OpenCode API key and enable Zen/Go immediately',
      recordInput: false,
      handler: async (invocation: CommandInvocation): Promise<CommandResult> => {
        const raw = invocation.rawInput.trim()
        let stored = false
        if (raw.length > 0) {
          // Quick configure: validate, then store the key through the credential
          // seam for every configured reference before enabling the routes.
          try {
            assertUsableApiKey(raw, 'opencode-live', 'input')
          } catch (error) {
            return { kind: 'error', text: (error as Error).message }
          }
          const failures: string[] = []
          for (const ref of configuredRefs(services)) {
            try {
              await services.storeCredential(ref, raw)
            } catch (error) {
              failures.push(`${ref}: ${(error as Error).message}`)
            }
          }
          if (failures.length > 0) {
            return {
              kind: 'error',
              text: ['Could not store the OpenCode API key:', ...failures].join('\n'),
            }
          }
          stored = true
        }

        const routes = [ROUTE_BY_PRODUCT.zen, ROUTE_BY_PRODUCT.go]
        if (!stored) {
          const anyConfigured = (await Promise.all(routes.map(async route => {
            const facts = await services.describeCredential(route)
            return facts?.configured === true
          }))).some(configured => configured)
          if (!anyConfigured) {
            return {
              kind: 'success',
              text: [
                'No OpenCode API key is configured yet.',
                'Run /dsh-opencode <your-api-key> to store it securely and enable both routes at once,',
                'or store it through the standard credentials input (the web Models page writes it) and run /dsh-opencode again.',
                'This command never displays key values.',
              ].join('\n'),
            }
          }
        }
        if (invocation.signal.aborted) return { kind: 'success', text: 'Refresh cancelled.' }
        try {
          await services.catalog.refresh({ products: ['zen', 'go'], signal: invocation.signal })
        } catch {
          // The catalog keeps serving its last good snapshot; per-source
          // errors are visible through /opencode-status rather than failing
          // the enable command wholesale.
        }
        const lines = [stored ? 'OpenCode API key stored. Zen and Go are enabled:' : 'OpenCode API key configured. Zen and Go are enabled:']
        for (const route of routes) lines.push(await productStatus(ctx, services, PRODUCT_BY_ROUTE[route]))
        return { kind: 'success', text: lines.join('\n') }
      },
    },
  ]
}

/** Register every host command and return the disposers. */
export function registerCommands(ctx: Context, services: CommandServices): Array<() => void> {
  return commandDefinitions(ctx, services).map(definition => ctx.commands.register(definition))
}
