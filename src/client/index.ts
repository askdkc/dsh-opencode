import { CLIENT_MODULE_ID } from '../shared/opencode.ts'
import { OpenCodeProviderCard } from './OpenCodeProviderCard.tsx'
import { CredentialController } from './credential-controller.ts'
import type { Context } from '@deepseek-ai/cordis'

/** Settings must work without a session, slash commands, or a shell overlay. */
export const inject = ['remote', 'remote.credentials', 'settingsScope', 'slots']

export function apply(ctx: Context): void {
  ctx.effect(function* () {
    const controller = new CredentialController(ctx)
    yield () => controller.dispose()
    yield ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
      name: 'settings.models.provider-card',
      key: 'opencode-live',
      inject: () => ({ controller }),
    }, OpenCodeProviderCard))
  }, `${CLIENT_MODULE_ID}: provider settings`)
}
