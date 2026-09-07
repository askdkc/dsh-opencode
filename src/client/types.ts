import type { Context } from '@deepseek-ai/cordis'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'

export type ClientContext = Context & {
  readonly remote: ClientRemote
  readonly settingsScope: { describe(): SettingsDescribeFace }
  readonly slots: SlotRegistry
}
