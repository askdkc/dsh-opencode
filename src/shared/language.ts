export type Language = 'ja' | 'en'

/** Explicit DSH preference wins; otherwise use the primary browser/OS locale. */
export function resolveLanguage(preference: unknown, fallback?: string): Language {
  const locale = typeof preference === 'string' && preference.trim() ? preference : fallback
  return /^ja(?:[-_.@]|$)/i.test(locale?.trim() ?? '') ? 'ja' : 'en'
}

export function localePreference(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'preference' in value ? value.preference : undefined
}

export const setupHelp = [
  '1. Open Settings > Models.',
  '2. Enter your API key in the OpenCode provider you want to use.',
  '3. Click "Save API key".',
].join('\n')
export const setupUsage = 'Enter your API key in Settings > Models, not in chat.'
export const setupSaved = 'Your OpenCode API key is saved. Choose an OpenCode model from the model picker at the bottom right of the chat.'
export const setupCancelled = 'The check was cancelled.'

/** English source copy is the key. Only our known copy is translated. */
const japanese: Record<string, string> = {
  'OpenCode settings': 'OpenCode の設定',
  'Close': '閉じる',
  'OpenCode API key': 'OpenCode APIキー',
  'Key saved — enter a new key to replace it': '保存済みです。変更する場合は新しいキーを入力してください',
  'Paste your OpenCode API key': 'OpenCodeのAPIキーを貼り付けてください',
  'This key is shared by OpenCode Zen and Go. Deleting it removes the key for both providers.': 'このキーはOpenCode ZenとGoで共有しています。削除すると両方のキー設定が解除されます。',
  'Checking credential status…': 'APIキーの設定を確認しています…',
  'Saving…': '保存中…',
  'Save API key': 'APIキーを保存',
  'Deleting…': '削除中…',
  'Delete API key': 'APIキーを削除',
  'Clear input': '入力を消去',
  'The credential check was cancelled.': 'APIキーの確認をキャンセルしました。',
  'The configured credential reference is unavailable.': 'APIキーの保存先を確認できませんでした。',
  'Could not check whether an API key is saved.': 'APIキーが保存されているか確認できませんでした。',
  'Could not load settings or credential status.': '設定またはAPIキーの状態を読み込めませんでした。',
  'The settings form was closed.': '設定画面が閉じられました。',
  'The settings form was closed. Open it again and retry.': '設定画面が閉じられました。開き直して再試行してください。',
  'The API key settings changed. Check which providers share the key and retry.': 'APIキーの設定が変更されました。キーを共有するプロバイダーを確認して再試行してください。',
  'This credential is read-only. Remove it from the environment that launches DSH.': 'このAPIキーは読み取り専用です。DSHを起動する環境の設定から削除してください。',
  'This credential is already being updated.': 'このAPIキーは更新中です。完了後に再試行してください。',
  'Could not delete the API key. Try again.': 'APIキーを削除できませんでした。再試行してください。',
  'The deletion request succeeded, but the key status could not be confirmed. Reload Settings > Models.': '削除リクエストは成功しましたが、キーの状態を確認できませんでした。Settings > Modelsを開き直してください。',
  'The saved key was removed, but an API key is still configured. Check its source in Settings > Models.': '保存したキーは削除されましたが、別のAPIキー設定が残っています。Settings > Modelsで設定元を確認してください。',
  'API key deleted for OpenCode Zen and Go.': 'OpenCode ZenとGoの共有APIキーを削除しました。',
  'API key deleted.': 'APIキーを削除しました。',
  'Paste the API key only, without quotes or an environment-variable assignment.': '引用符や環境変数の代入式を含めず、APIキーだけを貼り付けてください。',
  'The credential reference changed. Reload its status and retry.': 'APIキーの保存先が変更されました。状態を読み込み直して再試行してください。',
  'This credential is read-only. Update it in the environment that launches DSH.': 'このAPIキーは読み取り専用です。DSHを起動する環境の設定で変更してください。',
  'Could not save the API key.': 'APIキーを保存できませんでした。',
  'The API key is not configured. Enter it in Settings > Models, click "Save API key", then send your message again.': 'APIキーが未設定です。Settings > ModelsでAPIキーを入力して「APIキーを保存」を押してから、もう一度送信してください。',
  'API key saved.': 'APIキーを保存しました。',
  'The key was saved, but its status could not be confirmed.': 'APIキーを保存しましたが、保存後の状態を確認できませんでした。',
  '1. Open Settings > Models.': '1. Settings > Modelsを開きます。',
  '2. Enter your API key in the OpenCode provider you want to use.': '2. 使用するOpenCodeの欄にAPIキーを入力します。',
  '3. Click "Save API key".': '3. 「APIキーを保存」を押してください。',
  [setupUsage]: 'APIキーはチャットに入力せず、Settings > Modelsから設定してください。',
  [setupSaved]: 'OpenCodeのAPIキーは保存されています。チャット右下のモデル選択から、使いたいOpenCodeのモデルを選んでください。',
  [setupCancelled]: '確認をキャンセルしました。',
}
for (const label of ['OpenCode', 'OpenCode Zen', 'OpenCode Go', 'OpenCode Zen and OpenCode Go']) {
  const jaLabel = label.replace(' and ', '・')
  japanese[`${label} API key is not configured.`] = `${jaLabel}のAPIキーが未設定です。`
  japanese[`Could not check the API key settings for ${label}.`] = `${jaLabel}のAPIキー設定を確認できませんでした。`
}

// CommandResult carries text only. Recognize our own catalog in either language
// so each browser can render Host results using its own current preference.
const english = new Map(Object.entries(japanese).map(([en, ja]) => [ja, en]))
export function translate(text: string, language: Language): string {
  return text.split('\n').map(line => {
    const source = english.get(line) ?? line
    return language === 'ja' ? japanese[source] ?? line : source
  }).join('\n')
}
