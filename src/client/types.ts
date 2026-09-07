import type { Context } from '@deepseek-ai/cordis'
import type { CommandUiContract } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-commands/remote'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ReactNode } from 'react'

export type ClientContext = Context & {
  readonly commandUi: CommandUiContract
  readonly remote: ClientRemote
  readonly settingsScope: { describe(): SettingsDescribeFace }
  readonly slots: {
    inject(name: string, factory: () => unknown): () => void
    register(definition: Record<string, unknown>, component: (props: any) => ReactNode): () => void
  }
}

export interface ProviderOwnerProps {
  provider: { provider: string; settingsPath?: readonly string[] }
  configured: boolean
  keyConfigured: boolean
}
