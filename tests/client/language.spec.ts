import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageController } from '../../src/client/language.ts'
import { resolveLanguage, setupHelp, translate } from '../../src/shared/language.ts'
import { commandDefinitions } from '../../src/commands.ts'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('automatic Japanese / English selection', () => {
  it.each([
    [undefined, 'ja-JP', 'ja'], [undefined, 'en-US', 'en'],
    [undefined, 'fr-FR', 'en'], [undefined, undefined, 'en'],
    ['en', 'ja-JP', 'en'], ['ja', 'en-US', 'ja'],
    ['ja-JP', 'en-US', 'ja'], ['zh', 'ja-JP', 'en'],
    [undefined, 'ja_JP.UTF-8', 'ja'], [undefined, 'C.UTF-8', 'en'],
  ])('selects %s over %s as %s', (preference, browser, expected) => {
    expect(resolveLanguage(preference, browser)).toBe(expected)
  })

  it('updates mounted consumers on preference/browser changes and releases subscriptions', async () => {
    let preference: string | undefined
    let status = 'loading'
    const callbacks = new Set<() => void>()
    const browser = { languages: ['ja-JP'], language: 'ja-JP' }
    const window = new EventTarget()
    vi.stubGlobal('navigator', browser)
    vi.stubGlobal('window', window)
    const face = {
      getSnapshot: () => ({ status, view: { namespaces: [{ ns: 'locale', value: { preference } }] } }),
      subscribe: (fn: () => void) => { callbacks.add(fn); return () => { callbacks.delete(fn) } },
      ensure: async () => undefined,
    }
    const controller = new LanguageController({ settingsScope: { describe: () => face } } as never)
    const changed = vi.fn()
    controller.subscribe(changed)
    expect(controller.getSnapshot()).toBe('ja')
    status = 'ready'
    preference = 'en'
    for (const fn of callbacks) fn()
    expect(controller.getSnapshot()).toBe('en')
    preference = 'ja'
    for (const fn of callbacks) fn()
    expect(controller.getSnapshot()).toBe('ja')
    preference = undefined
    browser.languages = ['en-US']
    window.dispatchEvent(new Event('languagechange'))
    expect(controller.getSnapshot()).toBe('en')
    expect(changed).toHaveBeenCalledTimes(3)
    controller.dispose()
    expect(callbacks.size).toBe(0)
    browser.languages = ['ja-JP']
    window.dispatchEvent(new Event('languagechange'))
    await Promise.resolve()
    expect(changed).toHaveBeenCalledTimes(3)
  })

  it('translates guidance and feedback without losing unknown failure details', () => {
    const ja = translate(setupHelp, 'ja')
    expect(ja).toContain('「APIキーを保存」')
    expect(translate(ja, 'en')).toBe(setupHelp)
    expect(translate('API key deleted for OpenCode Zen and Go.', 'ja')).toContain('共有APIキーを削除しました')
    expect(translate('Could not save the API key.', 'ja')).toBe('APIキーを保存できませんでした。')
    expect(translate('Unexpected server failure: 503', 'ja')).toBe('Unexpected server failure: 503')
  })

  it.each(['en', 'ja'])('localizes all setup outcomes on the Host and back in the browser (%s)', async preference => {
    const ctx = { get: () => ({ get: () => ({ preference }) }) }
    for (const zen of [true, false, undefined]) {
      for (const go of [true, false, undefined]) {
        const services = { describeCredential: async (route: string) => {
          const configured = route === 'opencode-zen-live' ? zen : go
          return configured === undefined ? undefined : { configured, writable: true }
        } }
        const command = commandDefinitions(ctx as never, services as never).find(item => item.name === 'dsh-opencode')!
        for (const rawInput of ['', 'help', 'sk-do-not-echo']) {
          const result = await command.handler({ rawInput, signal: new AbortController().signal } as never)
          expect(result.text).not.toContain('sk-do-not-echo')
          const english = translate(result.text ?? '', 'en')
          const japanese = translate(result.text ?? '', 'ja')
          expect(english).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/)
          expect(japanese).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/)
          expect(result.text).toBe(preference === 'ja' ? japanese : english)
          expect(translate(japanese, 'en')).toBe(english)
        }
      }
    }
  })

  it('uses the Host environment only when DSH has no language preference', async () => {
    vi.stubEnv('LC_ALL', 'ja_JP.UTF-8')
    const services = { describeCredential: async () => ({ configured: false, writable: true }) }
    const result = await commandDefinitions({} as never, services as never).find(item => item.name === 'dsh-opencode')!.handler({ rawInput: '', signal: new AbortController().signal } as never)
    expect(result.text).toContain('APIキーが未設定')
  })
})
