/** Browser-safe identifiers shared by the Host metadata and Client UI. */
export const CLIENT_MODULE_ID = 'dsh-opencode'
export const SETTINGS_NAMESPACE = 'opencode-live'
export const DEFAULT_API_KEY_REF = 'OPENCODE_API_KEY'
export const ROUTES = {
  zen: 'opencode-zen-live',
  go: 'opencode-go-live',
} as const
export const HELP_URLS = {
  auth: 'https://opencode.ai/auth',
  zen: 'https://opencode.ai/docs/zen/',
  go: 'https://opencode.ai/docs/go/',
} as const
