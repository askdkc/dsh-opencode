/**
 * The `opencode-live` Cordis plugin.
 *
 * Composition owns exactly four things: the two fixed live routes and their
 * settings namespace, the catalog manager publishing immutable snapshots, the
 * operator commands, and the registration lifecycle. Model inference itself
 * is delegated to the public DSH `PiAiAdapter`; provider construction is
 * delegated to pi-ai's public `createProvider()`.
 *
 * An executable-set change re-registers the same routes through the
 * registration handle's `replace()`, which commits atomically and publishes
 * `llm/adapters-updated`, so an open selection UI re-fetches the new model
 * set without a restart. Unloading stops timers, aborts fetches, and refuses
 * every late completion.
 *
 * @module opencode-live
 */

import type { Context } from '@deepseek-ai/cordis'
import { resolveImageAttachmentAccess, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type {
  AdapterRegistrationHandle,
  DirectoryRegistrationHandle,
  LlmConfigurableProvider,
} from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-settings'
import { LiveOpenCodeAdapter } from './adapter.ts'
import { CatalogManager } from './catalog.ts'
import { Config, assertServiceable, resolveConfig } from './config.ts'
import type { ResolvedPluginConfig } from './config.ts'
import { DEFAULT_MAX_REQUEST_IMAGE_BYTES, DEFAULT_REQUEST_IMAGE_MAX_BYTES, DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET } from './config.ts'
import { apiKeyOnlyAuth, describeCredential, resolveApiKeyFor, staticAuthBridge } from './credentials.ts'
import { registerCommands } from './commands.ts'
import type { Product, RouteId } from './normalize.ts'
import { ROUTE_BY_PRODUCT } from './normalize.ts'
import { readySetHash } from './snapshot.ts'
import type { CatalogSnapshot } from './snapshot.ts'
import { buildRouteProvider } from './transport.ts'

/** Cordis plugin name. */
export const name = 'opencode-live'

/** Services required before the plugin can activate. */
export const inject = ['llm']

/** The settings namespace this plugin owns. */
export const SETTINGS_NAMESPACE = 'opencode-live'

export { Config } from './config.ts'

/**
 * Register the plugin against one composition context.
 * @param ctx - the Cordis context.
 * @param config - the composition base configuration for this plugin.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = resolveConfig(config)
  let currentConfig: ResolvedPluginConfig = resolved
  let configRevision = 0

  const catalog = new CatalogManager({
    config: {
      ...resolved.catalog,
      ...resolved.catalog.cachePath === undefined ? { cachePath: defaultCachePath() } : {},
    },
    onChange: snapshot => onCatalogChange(snapshot),
    warn: message => ctx.logger.warn(message),
  })

  const auth = staticAuthBridge()
  const adapter = new LiveOpenCodeAdapter({
    profiles,
    resolveApiKey: (route, profile) => resolveApiKeyFor(ctx, route, profile),
    auth,
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(
      attachments,
      hostPath => ctx.get('fs')?.processPathFromHostPath(hostPath),
      ref,
    ),
    catalog,
    initialWaitMs: currentConfig.catalog.timeoutMs,
    requireFresh: currentConfig.catalog.requireFresh,
    onReplayDegrade: ({ provider, model, reason }) => {
      ctx.logger.warn(
        `opencode-live: unusable replay state on assistant history for route "${provider}/${model}";`
        + ` sending that message as provider-neutral content (${reason})`,
      )
    },
  })

  /** Memoized profiles keyed by configuration revision and catalog content. */
  let memoKey: string | undefined
  let memoProfiles: ReadonlyMap<string, ResolvedPiAiProviderProfile> | undefined

  function profiles(): ReadonlyMap<string, ResolvedPiAiProviderProfile> {
    const key = `${configRevision}:${catalog.current?.contentHash ?? 'empty'}`
    if (memoKey === key && memoProfiles !== undefined) return memoProfiles
    const map = new Map<string, ResolvedPiAiProviderProfile>()
    for (const [route, providerConfig] of currentConfig.providers) {
      const snapshot = catalog.current
      const view = snapshot?.products[providerConfig.product]
      const ready = view === undefined
        ? []
        : view.readyIds.map(id => view.candidates.get(id)).filter(candidate => candidate !== undefined)
      map.set(route, {
        provider: route,
        displayName: providerConfig.displayName,
        apiKeyEnv: providerConfig.apiKeyEnv,
        streamIdleTimeoutMs: providerConfig.streamIdleTimeoutMs,
        maxRequestImageBytes: DEFAULT_MAX_REQUEST_IMAGE_BYTES,
        requestImagePixelBudget: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
        requestImageMaxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
        retryPolicy: providerConfig.retryPolicy ?? resolveRetryPolicy(undefined, `opencode-live: provider "${route}" retryPolicy`),
        ...providerConfig.headers !== undefined ? { headers: { ...providerConfig.headers } } : {},
        // Catalog capacities size the model; they never become request
        // defaults. Only an explicit per-model configuration belongs here,
        // and this plugin defines none.
        configuredMaxTokens: new Map(),
        piProvider: buildRouteProvider({
          route,
          product: providerConfig.product,
          displayName: providerConfig.displayName,
          ready,
          auth: { apiKey: apiKeyOnlyAuth(providerConfig.displayName) },
        }),
      })
    }
    memoKey = key
    memoProfiles = map
    return map
  }

  let registration: AdapterRegistrationHandle | undefined
  let registeredFacts: string | undefined
  let lastReadyHash: string | undefined

  /** The current route list in fixed order. */
  function routeList(): string[] {
    return [...currentConfig.providers.keys()]
  }

  /** Registration facts: routes with their display names and retry policies. */
  function registrationFacts(): string {
    return JSON.stringify(routeList().map(route => {
      const provider = currentConfig.providers.get(route as RouteId)
      return {
        route,
        displayName: provider?.displayName,
        retryPolicy: provider?.retryPolicy,
      }
    }))
  }

  /** Register or atomically replace this adapter's routes. */
  function ensureRegistration(): void {
    const routes = routeList()
    const facts = registrationFacts()
    if (registration === undefined) {
      // A bare mount with no configured routes stays dormant; the first
      // settings-driven route registers the moment one appears.
      if (routes.length === 0) {
        registeredFacts = facts
        return
      }
      registration = ctx.llm.registerAdapter(routes, adapter)
      registeredFacts = facts
      return
    }
    // Config facts or the executable set changed: the same adapter instance
    // re-registers in place, which publishes `llm/adapters-updated`.
    registration.replace(routes)
    registeredFacts = facts
  }

  /** The directory entries for the two fixed routes. */
  function directoryEntries(): LlmConfigurableProvider[] {
    return routeList().map(route => ({
      provider: route,
      displayName: currentConfig.providers.get(route as RouteId)?.displayName ?? route,
      settingsNs: SETTINGS_NAMESPACE,
      settingsPath: ['providers', route],
      declared: true,
    }))
  }

  let directory: DirectoryRegistrationHandle | undefined
  let directoryFacts: string | undefined

  /** Register or atomically replace the configurable-provider directory. */
  function ensureDirectory(): void {
    const entries = directoryEntries()
    const facts = JSON.stringify(entries)
    if (directory === undefined) {
      if (entries.length === 0) {
        directoryFacts = facts
        return
      }
      directory = ctx.llm.registerConfigurableProviders(entries)
      directoryFacts = facts
      return
    }
    directory.replace(entries)
    directoryFacts = facts
  }

  /** Re-register only when the executable set actually changed. */
  function onCatalogChange(snapshot: CatalogSnapshot | undefined): void {
    if (snapshot === undefined) return
    const hash = readySetHash(snapshot)
    if (hash === lastReadyHash) return
    lastReadyHash = hash
    if (registration !== undefined) ensureRegistration()
  }

  ensureRegistration()
  ensureDirectory()

  // Host commands are optional: a composition without the commands service
  // simply has no surface for them, while everything else still works.
  let commandDisposers: Array<() => void> = []
  ctx.inject(['commands'], (commandsCtx) => {
    commandDisposers = registerCommands(commandsCtx, {
      catalog,
      config: () => currentConfig,
      describeCredential: async (route) => {
        const provider = currentConfig.providers.get(route)
        if (provider === undefined) return undefined
        return describeCredential(ctx, provider.apiKeyEnv)
      },
    })
  })

  // The settings section is likewise optional; a headless composition keeps
  // running on the composition base configuration alone.
  let source: () => Config = () => config
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, Config, config, {
      validate: assertServiceable,
      setSource: (next) => {
        source = next
      },
      onChange: () => {
        try {
          const next = resolveConfig(source())
          const catalogChanged = JSON.stringify(next.catalog) !== JSON.stringify(currentConfig.catalog)
          const routesChanged = registrationFacts() !== registeredFacts
          currentConfig = next
          configRevision += 1
          adapter.updateOptions({
            initialWaitMs: next.catalog.timeoutMs,
            requireFresh: next.catalog.requireFresh,
          })
          if (catalogChanged) {
            catalog.reconfigure({ ...next.catalog, ...next.catalog.cachePath === undefined ? {} : { cachePath: next.catalog.cachePath } })
          }
          if (routesChanged) ensureRegistration()
          ensureDirectory()
        } catch (error) {
          ctx.logger.error('opencode-live: keeping the previously registered routes after a refused settings update')
          ctx.logger.error(error)
        }
      },
    })
  })

  ctx.effect(function* () {
    yield () => {
      catalog.stop()
      for (const dispose of commandDisposers) dispose()
      commandDisposers = []
    }
  }, 'opencode-live effects')

  void catalog.start().catch((error: unknown) => {
    ctx.logger.warn('opencode-live: the initial catalog refresh failed; the catalog will retry periodically')
    ctx.logger.warn(error)
  })
}

/** The default cache location under the resolved DSH home. */
function defaultCachePath(): string {
  return dshHomePath('cache', 'opencode-live', 'catalog.json')
}

export { ROUTE_BY_PRODUCT }
export type { Product, RouteId }
