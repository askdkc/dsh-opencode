import { CLIENT_MODULE_ID } from '../shared/opencode.ts'
import { OpenCodeProviderCard } from './OpenCodeProviderCard.tsx'
import { CredentialController } from './credential-controller.ts'
import { CommandNotice } from './CommandNotice.tsx'
import { LanguageController } from './language.ts'
import { CommandNoticeController } from './command-notice.ts'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { Context } from '@deepseek-ai/cordis'

/** Settings must work without a session, slash commands, or a shell overlay. */
export const inject = ['remote', 'remote.credentials', 'settingsScope', 'slots']

export function apply(ctx: Context): void {
  const language = new LanguageController(ctx)
  ctx.effect(() => () => language.dispose())
  ctx.effect(function* () {
    const controller = new CredentialController(ctx)
    yield () => controller.dispose()
    yield ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
      name: 'settings.models.provider-card',
      key: 'opencode-live',
      inject: () => ({ controller, language }),
    }, OpenCodeProviderCard))
  }, `${CLIENT_MODULE_ID}: provider settings`)
  // The optional overlay never gates the provider settings form.
  ctx.slots.inject('shell.overlay', function* () {
    const notice = new CommandNoticeController()
    yield () => notice.dispose()
    yield ctx.on('command/executed', (_sessionId, name, result) => notice.show(name, result))
    yield ctx.slots.register({
      name: 'shell.overlay',
      id: 'opencode-command-notice',
      inject: () => ({ controller: notice, language }),
    }, CommandNotice)
  })
}
