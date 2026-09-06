import { SETTINGS_NAMESPACE } from "./index.js";
import { assertUsableApiKey } from "@deepseek-ai/dsh-llm";
//#region src/keyring.ts
/**
* Read one reference's presence, treating an absent credential service as a
* stable `false` rather than a throw: the caller wants facts, not a diagnosis.
*/
async function refState(ctx, ref) {
	const credentials = ctx.get("credentials");
	if (credentials === void 0) return {
		configured: false,
		writable: false
	};
	const described = await credentials.describe(ref);
	return described === void 0 ? {
		configured: false,
		writable: false
	} : {
		configured: described.configured,
		writable: described.writable
	};
}
/**
* Read the state a key store is about to operate against.
* @param ctx - the plugin context.
* @param providers - the currently resolved provider profiles.
* @returns the immutable snapshot for before/after comparison.
*/
async function snapshotKeyring(ctx, providers) {
	const settings = ctx.get("settings");
	const sectionValue = settings === void 0 ? void 0 : settings.get(SETTINGS_NAMESPACE);
	const refs = /* @__PURE__ */ new Map();
	for (const { apiKeyEnv } of providers) if (!refs.has(apiKeyEnv)) refs.set(apiKeyEnv, await refState(ctx, apiKeyEnv));
	return {
		section: JSON.stringify(sectionValue ?? null),
		refs
	};
}
/**
* Verify a key store left no stray change. Compares the section snapshot and
* every reference the plugin knows with a stable JSON text, so a change in
* either is caught regardless of ordering.
* @param before - the snapshot taken before the store.
* @param after - the snapshot taken after the store.
* @param refs - the references the store wrote (the only ones allowed to move).
* @returns a failure line, or `undefined` when only the intended refs changed.
*/
function verifyNoStrayChange(before, after, refs) {
	if (before.section !== after.section) return `opencode-live: the settings section changed while storing the key (${SETTINGS_NAMESPACE})`;
	for (const [ref, state] of before.refs) {
		const next = after.refs.get(ref);
		if (next === void 0) return `opencode-live: credential ${ref} vanished after storing the key`;
		if (state.configured === next.configured && state.writable === next.writable) continue;
		if (!refs.includes(ref)) return `opencode-live: an unrelated credential reference changed (${ref})`;
	}
	for (const [ref, next] of after.refs) {
		if (before.refs.has(ref)) continue;
		if (!refs.includes(ref)) return `opencode-live: an unrelated credential reference appeared (${ref})`;
		if (!next.configured) return `opencode-live: the stored reference ${ref} did not become configured`;
	}
}
/**
* Store one OpenCode key through the DSH credential seam.
*
* This is the whole write surface a command uses. Validation runs before any
* write, so a key that would be refused is never persisted. The write is
* fenced by `snapshotKeyring` before and after; a stray settings or unrelated
* credential change fails the call with a diagnostic instead of silently
* committing alongside the key.
* @param ctx - the plugin context.
* @param providers - the currently resolved provider profiles.
* @param value - the key typed into the command's input field.
* @returns `undefined` on success, or a failure line naming the exact problem.
*/
async function storeApiKey(ctx, providers, value) {
	try {
		assertUsableApiKey(value, "opencode-live", "input");
	} catch (error) {
		return error.message;
	}
	const credentials = ctx.get("credentials");
	if (credentials === void 0) return "opencode-live: no credentials service is mounted; export the API key in the launch environment instead";
	const before = await snapshotKeyring(ctx, providers);
	const targets = [...new Set([...providers].map(({ apiKeyEnv }) => apiKeyEnv))];
	try {
		for (const ref of targets) await credentials.set(ref, value);
	} catch (error) {
		return `opencode-live: could not store the API key (${error.message})`;
	}
	return verifyNoStrayChange(before, await snapshotKeyring(ctx, providers), targets);
}
/**
* Presence facts for the status path: whether a key is configured, without
* ever exposing a value.
* @param ctx - the plugin context.
* @param providers - the currently resolved provider profiles.
* @returns whether the shared reference is configured.
*/
async function keyConfigured(ctx, providers) {
	const refs = [...new Set([...providers].map(({ apiKeyEnv }) => apiKeyEnv))];
	return (await Promise.all(refs.map((ref) => refState(ctx, ref)))).some((state) => state.configured);
}
/** Whether any reference is read-only, so the status can say so. */
async function keyReadonly(ctx, providers) {
	const refs = [...new Set([...providers].map(({ apiKeyEnv }) => apiKeyEnv))];
	return (await Promise.all(refs.map((ref) => refState(ctx, ref)))).some((state) => !state.writable);
}
//#endregion
export { keyConfigured, keyReadonly, snapshotKeyring, storeApiKey, verifyNoStrayChange };
