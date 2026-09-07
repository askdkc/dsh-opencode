import type { CredentialInfo } from '@deepseek-ai/dsh-api-remotes/client'
import { ROUTES, SETTINGS_NAMESPACE } from '../shared/opencode.ts'
import type { ClientContext } from './types.ts'

export type Route = keyof typeof ROUTES
export type RouteCredentialState =
  | { kind: 'loading'; route: Route }
  | { kind: 'unavailable'; route: Route; reason: string }
  | { kind: 'known'; route: Route; ref: string; configured: boolean; writable: boolean; source?: string; sharedWith: readonly Route[] }

export interface SaveResult {
  kind: 'saved' | 'saved-unconfirmed' | 'error'
  message: string
}

export interface DeleteResult {
  kind: 'deleted' | 'deleted-unconfirmed' | 'error'
  message: string
}

interface RemoteResult<T> {
  ok: boolean
  value?: T
  error?: unknown
}

interface SettingsValue {
  providers?: Record<string, { apiKeyEnv?: unknown }>
}

function routeFromProvider(value: string): Route | undefined {
  if (value === ROUTES.zen) return 'zen'
  if (value === ROUTES.go) return 'go'
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function unavailable(route: Route, reason: string): RouteCredentialState {
  return { kind: 'unavailable', route, reason }
}

function decodeDescribe(result: unknown, ref: string): CredentialInfo | undefined {
  if (!isRecord(result) || result.ok !== true || !isRecord(result.value)) return undefined
  const info = result.value[ref]
  if (!isRecord(info) || typeof info.configured !== 'boolean' || typeof info.writable !== 'boolean') return undefined
  return {
    configured: info.configured,
    writable: info.writable,
    ...typeof info.source === 'string' ? { source: info.source } : {},
  }
}

function isSuccessfulWrite(result: unknown): boolean {
  return isRecord(result) && result.ok === true
}

export class CredentialController {
  private readonly inFlight = new Set<string>()
  private readonly states = new Map<Route, RouteCredentialState>()
  private readonly generations = new Map<Route, number>()
  private readonly subscriptions: Array<() => void> = []
  private disposed = false
  private disposalGeneration = 0

  public constructor(private readonly ctx: ClientContext) {
    const settings = ctx.settingsScope.describe()
    this.subscriptions.push(settings.subscribe(() => this.invalidate()))
    if (typeof ctx.remote.$on === 'function') {
      for (const event of ['credentials/reference-updated', 'settings/document-updated'] as const) {
        this.subscriptions.push(ctx.remote.$on(event, () => this.invalidate()))
      }
    }
    const events = ctx as ContextWithStringEvents
    if (typeof events.on === 'function') {
      this.subscriptions.push(events.on('connection/reset', () => this.invalidate()))
    }
  }

  public dispose(): void {
    this.disposed = true
    this.disposalGeneration += 1
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe()
    this.generations.clear()
    this.states.clear()
    this.inFlight.clear()
    this.listeners.clear()
  }

  public subscribe(listener: () => void): () => void {
    const listeners = this.listeners
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  private readonly listeners = new Set<() => void>()

  private reloadScheduled = false

  private invalidate(): void {
    if (this.disposed) return
    for (const route of this.states.keys()) {
      this.generations.set(route, (this.generations.get(route) ?? 0) + 1)
      this.states.set(route, { kind: 'loading', route })
    }
    for (const listener of this.listeners) listener()
    if (this.reloadScheduled) return
    this.reloadScheduled = true
    queueMicrotask(() => {
      this.reloadScheduled = false
      if (!this.disposed) {
        for (const route of this.states.keys()) void this.loadRoute(route)
      }
    })
  }

  private currentSettings(): { value: SettingsValue; face: ReturnType<ClientContext['settingsScope']['describe']> } | undefined {
    const face = this.ctx.settingsScope.describe()
    const snapshot = face.getSnapshot()
    if (snapshot.status !== 'ready' || !isRecord(snapshot.view)) return undefined
    const namespace = snapshot.view.namespaces.find(item => item.ns === SETTINGS_NAMESPACE)
    if (namespace === undefined || !isRecord(namespace.value)) return undefined
    return { value: namespace.value as SettingsValue, face }
  }

  private refFor(value: SettingsValue, route: Route): string | undefined {
    const ref = value.providers?.[ROUTES[route]]?.apiKeyEnv
    return typeof ref === 'string' && ref.length > 0 ? ref : undefined
  }

  public async loadRoute(route: Route, signal?: AbortSignal): Promise<RouteCredentialState> {
    const generation = (this.generations.get(route) ?? 0) + 1
    this.generations.set(route, generation)
    this.states.set(route, { kind: 'loading', route })
    if (signal?.aborted || this.disposed) return unavailable(route, 'The credential check was cancelled.')
    const settings = this.ctx.settingsScope.describe()
    try {
      await settings.ensure()
      const current = this.currentSettings()
      if (current === undefined) return this.commit(route, generation, unavailable(route, 'The configured credential reference is unavailable.'))
      const ref = this.refFor(current.value, route)
      if (ref === undefined) return this.commit(route, generation, unavailable(route, 'The configured credential reference is unavailable.'))
      const result = await this.ctx.remote.credentials.describe([ref]) as unknown as RemoteResult<Record<string, CredentialInfo>>
      const info = decodeDescribe(result, ref)
      if (info === undefined) return this.commit(route, generation, unavailable(route, 'Could not check whether an API key is saved.'))
      const sharedWith: Route[] = []
      for (const other of ['zen', 'go'] as const) {
        if (other !== route && this.refFor(current.value, other) === ref) sharedWith.push(other)
      }
      if (signal?.aborted) return this.commit(route, generation, unavailable(route, 'The credential check was cancelled.'))
      return this.commit(route, generation, { kind: 'known', route, ref, ...info, sharedWith })
    } catch {
      return this.commit(route, generation, unavailable(route, 'Could not load settings or credential status.'))
    }
  }

  private commit(route: Route, generation: number, state: RouteCredentialState): RouteCredentialState {
    if (!this.disposed && this.generations.get(route) === generation) {
      this.states.set(route, state)
      for (const listener of this.listeners) listener()
    }
    return this.states.get(route) ?? unavailable(route, 'The settings form was closed.')
  }

  public async loadRoutes(signal?: AbortSignal): Promise<Record<Route, RouteCredentialState>> {
    const [zen, go] = await Promise.all([this.loadRoute('zen', signal), this.loadRoute('go', signal)])
    return { zen, go }
  }

  public state(route: Route): RouteCredentialState | undefined {
    return this.states.get(route)
  }

  /** Remove the saved credential, preserving the provider and its reference. */
  public async remove(route: Route, displayedRef: string): Promise<DeleteResult> {
    const displayed = this.states.get(route)
    const fence = this.disposalGeneration
    const current = await this.loadRoute(route)
    if (this.disposed || this.disposalGeneration !== fence) return { kind: 'error', message: 'The settings form was closed. Open it again and retry.' }
    if (displayed?.kind !== 'known' || current.kind !== 'known' || displayed.ref !== displayedRef || current.ref !== displayedRef
      || displayed.sharedWith.join(',') !== current.sharedWith.join(',')) {
      return { kind: 'error', message: 'The API key settings changed. Check which providers share the key and retry.' }
    }
    if (!current.writable) return { kind: 'error', message: 'This credential is read-only. Remove it from the environment that launches DSH.' }
    if (this.inFlight.has(current.ref)) return { kind: 'error', message: 'This credential is already being updated.' }
    this.inFlight.add(current.ref)
    try {
      const result = await this.ctx.remote.credentials.unset(current.ref)
      if (!isSuccessfulWrite(result)) return { kind: 'error', message: 'Could not delete the API key. Try again.' }
      await Promise.all([route, ...current.sharedWith].map(other => this.loadRoute(other)))
      const confirmed = this.state(route)
      if (confirmed?.kind !== 'known' || confirmed.ref !== current.ref) {
        return { kind: 'deleted-unconfirmed', message: 'The deletion request succeeded, but the key status could not be confirmed. Reload Settings > Models.' }
      }
      if (confirmed.configured) {
        return { kind: 'deleted-unconfirmed', message: 'The saved key was removed, but an API key is still configured. Check its source in Settings > Models.' }
      }
      return { kind: 'deleted', message: current.sharedWith.length > 0 ? 'API key deleted for OpenCode Zen and Go.' : 'API key deleted.' }
    } catch {
      return { kind: 'error', message: 'Could not delete the API key. Try again.' }
    } finally {
      this.inFlight.delete(current.ref)
    }
  }

  public async save(route: Route, value: string, displayedRef: string): Promise<SaveResult> {
    const normalized = value.trim()
    if (normalized.length === 0 || /[\r\n]/.test(normalized) || /^['"].*['"]$/.test(normalized) || normalized.includes('=')) {
      return { kind: 'error', message: 'Paste the API key only, without quotes or an environment-variable assignment.' }
    }
    const displayed = this.states.get(route)
    const fence = this.disposalGeneration
    const current = await this.loadRoute(route)
    if (this.disposed || this.disposalGeneration !== fence) return { kind: 'error', message: 'The settings form was closed. Open it again and retry.' }
    if (displayed?.kind !== 'known' || current.kind !== 'known' || displayed.ref !== displayedRef || current.ref !== displayedRef) {
      return { kind: 'error', message: 'The credential reference changed. Reload its status and retry.' }
    }
    if (!current.writable) return { kind: 'error', message: 'This credential is read-only. Update it in the environment that launches DSH.' }
    if (this.inFlight.has(current.ref)) return { kind: 'error', message: 'This credential is already being updated.' }
    this.inFlight.add(current.ref)
    try {
      if (this.disposed || this.disposalGeneration !== fence) return { kind: 'error', message: 'The settings form was closed. Open it again and retry.' }
      const result = await this.ctx.remote.credentials.set(current.ref, normalized) as unknown as RemoteResult<unknown>
      if (!isSuccessfulWrite(result)) return { kind: 'error', message: 'Could not save the API key.' }
      const confirmed = await this.loadRoute(route)
      for (const other of current.sharedWith) await this.loadRoute(other)
      return confirmed.kind === 'known' && confirmed.configured
        ? { kind: 'saved', message: 'API key saved.' }
        : { kind: 'saved-unconfirmed', message: 'The key was saved, but its status could not be confirmed.' }
    } catch {
      return { kind: 'error', message: 'Could not save the API key.' }
    } finally {
      this.inFlight.delete(current.ref)
    }
  }
}

export { routeFromProvider }

interface ContextWithStringEvents {
  on?: (event: string, listener: () => void) => () => void
}
