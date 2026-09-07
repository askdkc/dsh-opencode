import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { HELP_URLS } from '../shared/opencode.ts'
import { OpenCodeCredentialForm } from './OpenCodeCredentialForm.tsx'
import type { Route } from './credential-controller.ts'
import type { SetupController } from './setup-controller.ts'

export function OpenCodeSetupDialog(props: { controller: SetupController }): ReactNode {
  const snapshot = useSyncExternalStore(props.controller.subscribe, props.controller.getSnapshot, props.controller.getSnapshot)
  if (!snapshot.open) return null
  const close = () => props.controller.close()
  const body = snapshot.route === 'status'
    ? <div role="status">{snapshot.message ?? '設定状況を確認しました。'}<StatusRows controller={props.controller} /></div>
    : snapshot.route === undefined
      ? null
      : <CredentialFormForRoute route={snapshot.route} controller={props.controller} onCancel={close} />
  return (
    <Modal open onClose={close} title="OpenCode API キー設定" closeLabel="閉じる" description="キーの値は表示しません。">
      <p>OpenCode にサインインし、Zen または Go の API キーを作成して保存してください。</p>
      <p><a href={HELP_URLS.auth} target="_blank" rel="noopener noreferrer">サインイン</a>{' | '}<a href={HELP_URLS.zen} target="_blank" rel="noopener noreferrer">Zen の手順</a>{' | '}<a href={HELP_URLS.go} target="_blank" rel="noopener noreferrer">Go の手順</a></p>
      {body}
      <Button type="button" variant="ghost" onClick={close}>キャンセル</Button>
    </Modal>
  )
}

function CredentialFormForRoute(props: { route: Route; controller: SetupController; onCancel: () => void }): ReactNode {
  const state = props.controller.state(props.route) ?? { kind: 'loading' as const, route: props.route }
  return <OpenCodeCredentialForm route={props.route} state={state} controller={props.controller.credentials} onCancel={props.onCancel} />
}

function StatusRows(props: { controller: SetupController }): ReactNode {
  return <ul>{(['zen', 'go'] as const).map(route => {
    const state = props.controller.state(route)
    const text = state?.kind === 'known' ? state.configured ? 'API キー保存済み' : 'API キー未設定' : state?.kind === 'unavailable' ? state.reason : '状態を確認中です'
    return <li key={route}>{route === 'zen' ? 'Zen' : 'Go'}: {text}</li>
  })}</ul>
}
