import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { CredentialController, Route, RouteCredentialState } from './credential-controller.ts'

export function OpenCodeCredentialForm(props: {
  route: Route
  state: RouteCredentialState
  controller: CredentialController
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
    <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 10, padding: '16px 0' }}>
      <h4>{props.route === 'zen' ? 'OpenCode Zen (Live)' : 'OpenCode Go (Live)'}</h4>
      <label htmlFor={id}>OpenCode API key</label>
      <input
        id={id}
        type="password"
        placeholder={props.state.kind === 'known' && props.state.configured ? 'Key saved — enter a new key to replace it' : 'Paste your OpenCode API key'}
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #8886', borderRadius: 8, background: 'transparent', color: 'inherit', font: 'inherit' }}
        value={draft}
        onChange={event => setDraft(event.currentTarget.value)}
        autoComplete="new-password"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={error}
        aria-describedby={`${id}-status`}
      />
      {props.state.kind === 'known' && props.state.sharedWith.length > 0 && <p>This key is shared by OpenCode Zen and Go.</p>}
      {unavailable && <p>{props.state.kind === 'unavailable' ? props.state.reason : 'Checking credential status…'}</p>}
      {readOnly && <p>This credential is read-only. Update it in the environment that launches DSH.</p>}
      <p id={`${id}-status`} role={error ? 'alert' : 'status'} aria-live="polite">{message}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={disabled || draft.trim().length === 0} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save API key'}</button>
        <button type="button" disabled={saving} onClick={() => { setDraft(''); setMessage(''); setError(false) }}>Clear input</button>
      </div>
    </form>
  )
}
