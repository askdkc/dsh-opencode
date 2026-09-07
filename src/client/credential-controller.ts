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
  }

  public subscribe(listener: () => void): () => void {
    const listeners = this.listeners
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  private readonly listeners = new Set<() => void>()

  private invalidate(): void {
    for (const route of ['zen', 'go'] as const) this.generations.set(route, (this.generations.get(route) ?? 0) + 1)
    for (const listener of this.listeners) listener()
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
    if (signal?.aborted || this.disposed) return unavailable(route, '確認がキャンセルされました。')
    const settings = this.ctx.settingsScope.describe()
    try {
      await settings.ensure()
      const current = this.currentSettings()
      if (current === undefined) return this.commit(route, generation, unavailable(route, '設定の credential reference を確認できません。'))
      const ref = this.refFor(current.value, route)
      if (ref === undefined) return this.commit(route, generation, unavailable(route, '設定の credential reference を確認できません。'))
      const result = await this.ctx.remote.credentials.describe([ref]) as unknown as RemoteResult<Record<string, CredentialInfo>>
      const info = decodeDescribe(result, ref)
      if (info === undefined) return this.commit(route, generation, unavailable(route, '認証状態を確認できません。'))
      const sharedWith: Route[] = []
      for (const other of ['zen', 'go'] as const) {
        if (other !== route && this.refFor(current.value, other) === ref) sharedWith.push(other)
      }
      return this.commit(route, generation, { kind: 'known', route, ref, ...info, sharedWith })
    } catch {
      return this.commit(route, generation, unavailable(route, '設定または認証状態を確認できません。'))
    }
  }

  private commit(route: Route, generation: number, state: RouteCredentialState): RouteCredentialState {
    if (!this.disposed && this.generations.get(route) === generation) {
      this.states.set(route, state)
      for (const listener of this.listeners) listener()
    }
    return state
  }

  public async loadRoutes(signal?: AbortSignal): Promise<Record<Route, RouteCredentialState>> {
    const [zen, go] = await Promise.all([this.loadRoute('zen', signal), this.loadRoute('go', signal)])
    return { zen, go }
  }

  public state(route: Route): RouteCredentialState | undefined {
    return this.states.get(route)
  }

  public async save(route: Route, value: string, displayedRef: string): Promise<SaveResult> {
    const normalized = value.trim()
    if (normalized.length === 0 || /[\r\n]/.test(normalized) || /^['"].*['"]$/.test(normalized) || normalized.includes('=')) {
      return { kind: 'error', message: 'API キーの形式を確認してください。' }
    }
    const displayed = this.states.get(route)
    const fence = this.disposalGeneration
    const current = await this.loadRoute(route)
    if (this.disposed || this.disposalGeneration !== fence) return { kind: 'error', message: '設定画面が閉じられました。再試行してください。' }
    if (displayed?.kind !== 'known' || current.kind !== 'known' || displayed.ref !== displayedRef || current.ref !== displayedRef) {
      return { kind: 'error', message: '設定が更新されました。状態を再読み込みしてから再試行してください。' }
    }
    if (!current.writable) return { kind: 'error', message: 'この認証参照は読み取り専用です。' }
    if (this.inFlight.has(current.ref)) return { kind: 'error', message: '同じ認証参照の保存が進行中です。' }
    this.inFlight.add(current.ref)
    try {
      if (this.disposed || this.disposalGeneration !== fence) return { kind: 'error', message: '設定画面が閉じられました。再試行してください。' }
      const result = await this.ctx.remote.credentials.set(current.ref, normalized) as unknown as RemoteResult<unknown>
      if (!isSuccessfulWrite(result)) return { kind: 'error', message: 'API キーを保存できませんでした。' }
      const confirmed = await this.loadRoute(route)
      return confirmed.kind === 'known' && confirmed.configured
        ? { kind: 'saved', message: '保存しました。キーの値は表示しません。' }
        : { kind: 'saved-unconfirmed', message: '保存要求は成功しましたが、状態を再確認できませんでした。' }
    } catch {
      return { kind: 'error', message: 'API キーを保存できませんでした。' }
    } finally {
      this.inFlight.delete(current.ref)
    }
  }
}

export { routeFromProvider }

interface ContextWithStringEvents {
  on?: (event: string, listener: () => void) => () => void
}
