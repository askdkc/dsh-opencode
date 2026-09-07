import type { CommandDecoration, SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
import { CLIENT_MODULE_ID } from '../shared/opencode.ts'
import { OpenCodeProviderCard } from './OpenCodeProviderCard.tsx'
import { OpenCodeSetupDialog } from './OpenCodeSetupDialog.tsx'
import { SetupController } from './setup-controller.ts'
import type { ClientContext } from './types.ts'

const services = ['commandUi', 'remote.credentials', 'remote.commands', 'settingsScope', 'slots'] as const

export function apply(ctx: ClientContext): void {
  ctx.inject(services, injected => {
    const client = injected as unknown as ClientContext
    client.effect(() => {
      const setup = new SetupController(client)
      const disposers: Array<() => void> = []
      const decoration: CommandDecoration = {
        name: 'dsh-opencode',
        available: () => true,
        ui: {
          kind: 'popupSelect',
          options: async (_session, signal): Promise<readonly SelectOption[]> => {
            const states = await setup.credentials.loadRoutes(signal)
            const options: SelectOption[] = (['zen', 'go'] as const).map(route => {
              const state = states[route]
              return {
                id: route,
                label: route === 'zen' ? 'OpenCode Zen を設定' : 'OpenCode Go を設定',
                detail: state.kind === 'known' ? state.configured ? 'API キー保存済み' : 'API キー未設定' : state.kind === 'unavailable' ? state.reason : '状態を確認中です',
                active: state.kind === 'known' && state.configured,
              }
            })
            options.push(
              { id: 'status', label: '設定状況を確認', detail: 'キーの値は表示しません' },
              { id: 'refresh', label: 'モデル一覧を更新', detail: 'Host の更新コマンドを実行してください' },
            )
            return options
          },
          onSelect: (option, session) => { void setup.select(option, session.sessionId) },
        },
      }
      disposers.push(client.commandUi.decorate(decoration))
      disposers.push(client.slots.inject('settings.models.provider-card', () => client.slots.register({ name: 'settings.models.provider-card', key: 'opencode-live', inject: () => ({ controller: setup.credentials }) }, OpenCodeProviderCard)))
      disposers.push(client.slots.inject('shell.overlay', () => client.slots.register({ name: 'shell.overlay', id: 'opencode-live-setup', inject: () => ({ controller: setup }) }, OpenCodeSetupDialog)))
      return () => {
        setup.dispose()
        for (const dispose of disposers.splice(0)) dispose()
      }
    }, `${CLIENT_MODULE_ID}: client registrations`)
  })
}

export { SetupController }
export type { ClientContext, ProviderOwnerProps } from './types.ts'
