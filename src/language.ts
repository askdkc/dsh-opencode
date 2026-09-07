import type { Context } from '@deepseek-ai/cordis'
import { localePreference, resolveLanguage, translate } from './shared/language.ts'

/** Optional settings must never become a prerequisite for command registration. */
export function hostText(ctx: Context, text: string): string {
  const preference = localePreference(ctx.get?.('settings')?.get('locale'))
  return translate(text, resolveLanguage(preference, process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG))
}
