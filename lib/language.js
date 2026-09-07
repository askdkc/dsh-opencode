import { localePreference, resolveLanguage, translate } from "./shared/language.js";
//#region src/language.ts
/** Optional settings must never become a prerequisite for command registration. */
function hostText(ctx, text) {
	return translate(text, resolveLanguage(localePreference(ctx.get?.("settings")?.get("locale")), process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG));
}
//#endregion
export { hostText };
