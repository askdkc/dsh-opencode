import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CredentialController, Route, RouteCredentialState } from './credential-controller.ts'

export function OpenCodeCredentialForm(props: {
  route: Route
  state: RouteCredentialState
  controller: CredentialController
  onCancel: () => void
}): ReactNode {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const id = `opencode-api-key-${props.route}`
  const unavailable = props.state.kind !== 'known'
  const readOnly = props.state.kind === 'known' && !props.state.writable
  const disabled = saving || unavailable || readOnly

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (props.state.kind !== 'known') return
    setSaving(true)
    setError(false)
    void props.controller.save(props.route, draft, props.state.ref).then(result => {
      setSaving(false)
      setMessage(result.message)
      setError(result.kind === 'error')
      if (result.kind !== 'error') setDraft('')
    })
  }

  return (
    <form onSubmit={submit} noValidate>
      <h4>{props.route === 'zen' ? 'OpenCode Zen (Live)' : 'OpenCode Go (Live)'}</h4>
      <label htmlFor={id}>OpenCode API キー</label>
      <input
        id={id}
        type="password"
        value={draft}
        onChange={event => setDraft(event.currentTarget.value)}
        autoComplete="new-password"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={error}
        aria-describedby={`${id}-status`}
      />
      {unavailable && <p>{props.state.kind === 'unavailable' ? props.state.reason : '状態を確認中です。'}</p>}
      {readOnly && <p>この認証参照は読み取り専用です。</p>}
      <p id={`${id}-status`} role={error ? 'alert' : 'status'} aria-live="polite">{message}</p>
      <Button type="submit" variant="primary" disabled={disabled}>保存</Button>
      <Button type="button" variant="ghost" onClick={() => { setDraft(''); props.onCancel() }}>キャンセル</Button>
    </form>
  )
}
