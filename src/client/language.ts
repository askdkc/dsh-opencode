import { useSyncExternalStore } from 'react'
import { localePreference, resolveLanguage, translate } from '../shared/language.ts'
import type { Language } from '../shared/language.ts'
import type { ClientContext } from './types.ts'

/** Read the durable preference without registering languages or changing DSH settings. */
export class LanguageController {
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribe: () => void
  private language: Language
  private disposed = false

  constructor(private readonly ctx: Pick<ClientContext, 'settingsScope'>) {
    this.language = this.read()
    this.unsubscribe = ctx.settingsScope.describe().subscribe(this.refresh)
    if (typeof window !== 'undefined') window.addEventListener?.('languagechange', this.refresh)
    void ctx.settingsScope.describe().ensure().then(this.refresh, () => undefined)
  }

  private read(): Language {
    const snapshot = this.ctx.settingsScope.describe().getSnapshot()
    const value = snapshot.status === 'ready' ? snapshot.view?.namespaces.find(item => item.ns === 'locale')?.value : undefined
    const browser = typeof navigator === 'undefined' ? undefined : navigator.languages?.[0] || navigator.language
    return resolveLanguage(localePreference(value), browser)
  }

  private refresh = (): void => {
    if (this.disposed) return
    const next = this.read()
    if (this.language === next) return
    this.language = next
    for (const listener of this.listeners) listener()
  }

  getSnapshot = (): Language => this.language
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  dispose(): void {
    this.disposed = true
    this.unsubscribe()
    if (typeof window !== 'undefined') window.removeEventListener?.('languagechange', this.refresh)
    this.listeners.clear()
  }
}

export function useTranslation(controller: LanguageController): (text: string) => string {
  const language = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  return text => translate(text, language)
}
