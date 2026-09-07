import type { SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
import { CredentialController, type Route, type RouteCredentialState } from './credential-controller.ts'
import type { ClientContext } from './types.ts'

export type SetupRoute = Route | 'status'
export interface SetupState { open: boolean; route?: SetupRoute; message?: string }

export class SetupController {
  public readonly credentials: CredentialController
  private current: SetupState = { open: false }
  private readonly listeners = new Set<() => void>()

  public constructor(private readonly ctx: ClientContext) {
    this.credentials = new CredentialController(ctx)
  }

  public getSnapshot = (): SetupState => this.current

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    const credentialDispose = this.credentials.subscribe(listener)
    return () => { this.listeners.delete(listener); credentialDispose() }
  }

  public dispose(): void {
    this.credentials.dispose()
    this.listeners.clear()
    this.close()
  }

  private update(next: SetupState): void {
    this.current = next
    for (const listener of this.listeners) listener()
  }

  public open(route: SetupRoute, message?: string): void { this.update({ open: true, route, ...message === undefined ? {} : { message } }) }
  public close(): void { this.update({ open: false }) }

  private sessionId: unknown

  public async select(option: SelectOption, sessionId?: unknown): Promise<void> {
    this.sessionId = sessionId
    if (option.id === 'zen' || option.id === 'go') {
      this.open(option.id)
      await this.credentials.loadRoute(option.id)
      return
    }
    if (option.id === 'status') {
      this.open('status', '設定状況を確認中…')
      await this.credentials.loadRoutes()
      return
    }
    if (option.id === 'refresh') {
      this.open('status', 'モデル一覧を更新中…')
      const execute = commandsExecute(this.ctx)
      if (execute === undefined || this.sessionId === undefined) {
        this.open('status', '更新コマンドを利用できません。/opencode-refresh all を実行してください。')
        return
      }
      try {
        const result = await execute(this.sessionId, '/opencode-refresh all', [], undefined)
        this.open('status', result.ok ? 'モデル一覧の更新コマンドを送信しました。' : 'モデル一覧を更新できませんでした。')
      } catch {
        this.open('status', 'モデル一覧を更新できませんでした。')
      }
    }
  }

  public state(route: Route): RouteCredentialState | undefined { return this.credentials.state(route) }
}

interface CommandsRemote {
  execute(sessionId: unknown, line: string, images: readonly unknown[], signal?: AbortSignal): Promise<{ ok: boolean }>
}

function commandsExecute(ctx: ClientContext): CommandsRemote['execute'] | undefined {
  const remote = ctx.remote as unknown as { commands?: unknown }
  const commands = remote.commands
  if (typeof commands !== 'object' || commands === null) return undefined
  const execute = (commands as { execute?: unknown }).execute
  return typeof execute === 'function' ? execute.bind(commands) as CommandsRemote['execute'] : undefined
}
