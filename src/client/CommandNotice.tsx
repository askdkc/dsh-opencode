import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { useTranslation, type LanguageController } from './language.ts'
import type { CommandNoticeController } from './command-notice.ts'

/** Native modal keeps the full message readable and owns focus and Escape. */
export function CommandNotice({ controller, language }: { controller: CommandNoticeController; language: LanguageController }): ReactNode {
  const t = useTranslation(language)
  const text = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const bodyId = useId()
  useEffect(() => {
    const element = dialog.current
    if (text === undefined || element === null) return
    element.showModal()
    return () => { element.close() }
  }, [text])
  if (text === undefined) return null
  const lines = t(text).split('\n')
  const stepStart = lines.findIndex(line => /^\d+\. /.test(line))
  const hasSteps = stepStart >= 0 && lines.slice(stepStart).every(line => /^\d+\. /.test(line))
  const summary = hasSteps ? lines.slice(0, stepStart).join('\n') : t(text)
  return (
    <dialog
      lang={language.getSnapshot()}
      ref={dialog}
      className="dsh-opencode-notice"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={event => { event.preventDefault(); controller.close() }}
      style={{ width: 'min(520px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', boxSizing: 'border-box', padding: 28, border: '1px solid #8884', borderRadius: 16, background: 'Canvas', color: 'CanvasText', boxShadow: '0 16px 64px #0003', pointerEvents: 'auto', overflow: 'auto' }}
    >
      <style>{'.dsh-opencode-notice::backdrop { background: rgb(0 0 0 / 35%); }'}</style>
      <h2 id={titleId} style={{ margin: '0 0 20px', fontSize: 22 }}>{t('OpenCode settings')}</h2>
      <div id={bodyId} style={{ fontSize: 16, lineHeight: 1.8, overflowWrap: 'anywhere' }}>
        {summary && <p style={{ margin: '0 0 16px', whiteSpace: 'pre-wrap', fontWeight: 600 }}>{summary}</p>}
        {hasSteps && <ol style={{ margin: 0, paddingLeft: 24 }}>{lines.slice(stepStart).map((line, index) => <li key={index} style={{ paddingLeft: 4, marginTop: 10 }}>{line.replace(/^\d+\. /, '')}</li>)}</ol>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <button autoFocus type="button" onClick={controller.close} style={{ padding: '10px 24px', border: '1px solid #8886', borderRadius: 8, font: 'inherit', cursor: 'pointer' }}>{t('Close')}</button>
      </div>
    </dialog>
  )
}
