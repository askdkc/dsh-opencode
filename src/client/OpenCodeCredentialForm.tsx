import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation, type LanguageController } from './language.ts'
import type { CredentialController, Route, RouteCredentialState } from './credential-controller.ts'

export function OpenCodeCredentialForm(props: {
  route: Route
  state: RouteCredentialState
  controller: CredentialController
  language: LanguageController
}): ReactNode {
  const t = useTranslation(props.language)
  const [draft, setDraft] = useState('')
  const [action, setAction] = useState<'save' | 'delete' | undefined>()
  const saving = action !== undefined
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const id = `opencode-api-key-${props.route}`
  const unavailable = props.state.kind !== 'known'
  const readOnly = props.state.kind === 'known' && !props.state.writable
  const disabled = saving || unavailable || readOnly

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (props.state.kind !== 'known') return
    setAction('save')
    setError(false)
    void props.controller.save(props.route, draft, props.state.ref).then(result => {
      setAction(undefined)
      setMessage(result.message)
      setError(result.kind === 'error')
      if (result.kind !== 'error') setDraft('')
    })
  }

  const remove = () => {
    if (saving || props.state.kind !== 'known' || !props.state.configured || !props.state.writable) return
    setAction('delete')
    setError(false)
    setMessage('')
    void props.controller.remove(props.route, props.state.ref).then(result => {
      setAction(undefined)
      setMessage(result.message)
      setError(result.kind === 'error')
      if (result.kind !== 'error') setDraft('')
    })
  }

  return (
    <form lang={props.language.getSnapshot()} onSubmit={submit} noValidate style={{ display: 'grid', gap: 10, padding: '16px 0' }}>
      <h4>{props.route === 'zen' ? 'OpenCode Zen (Live)' : 'OpenCode Go (Live)'}</h4>
      <label htmlFor={id}>{t('OpenCode API key')}</label>
      <input
        id={id}
        type="password"
        placeholder={props.state.kind === 'known' && props.state.configured ? t('Key saved — enter a new key to replace it') : t('Paste your OpenCode API key')}
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #8886', borderRadius: 8, background: 'transparent', color: 'inherit', font: 'inherit' }}
        value={draft}
        onChange={event => setDraft(event.currentTarget.value)}
        autoComplete="new-password"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={error}
        aria-describedby={`${id}-status`}
      />
      {props.state.kind === 'known' && props.state.sharedWith.length > 0 && <p>{t('This key is shared by OpenCode Zen and Go. Deleting it removes the key for both providers.')}</p>}
      {unavailable && <p>{t(props.state.kind === 'unavailable' ? props.state.reason : 'Checking credential status…')}</p>}
      {readOnly && <p>{t('This credential is read-only. Update it in the environment that launches DSH.')}</p>}
      <p id={`${id}-status`} role={error ? 'alert' : 'status'} aria-live="polite">{t(message)}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="submit" disabled={disabled || draft.trim().length === 0} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>{t(action === 'save' ? 'Saving…' : 'Save API key')}</button>
        <button type="button" disabled={disabled || props.state.kind !== 'known' || !props.state.configured} onClick={remove} style={{ padding: '8px 16px', borderRadius: 8, color: '#b42318' }}>{t(action === 'delete' ? 'Deleting…' : 'Delete API key')}</button>
        <button type="button" disabled={saving} onClick={() => { setDraft(''); setMessage(''); setError(false) }}>{t('Clear input')}</button>
      </div>
    </form>
  )
}
