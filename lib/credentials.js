import { hostText } from "./language.js";
import { LlmError, assertUsableApiKey } from "@deepseek-ai/dsh-llm";
import "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
//#region src/credentials.ts
/**
* Resolve the API key for one inference call.
*
* Mirrors the fail-loud reference semantics of the DSH pi-ai adapter: a named
* reference that misses throws `MISSING_CREDENTIAL` with a settings instruction,
* never a key fragment, and never falls back to an ambient key
* another provider might have left in the environment.
* @param ctx - the plugin context carrying the optional credential service.
* @param route - the live route the credential is resolved for.
* @param profile - the resolved profile naming the credential reference.
* @returns the validated key for this call.
* @throws {LlmError} code `MISSING_CREDENTIAL` when the reference is unset.
*/
async function resolveApiKeyFor(ctx, route, profile) {
	const ref = profile.apiKeyEnv;
	if (ref === void 0) return void 0;
	const credentials = ctx.get("credentials");
	const hit = credentials !== void 0 ? (await credentials.resolve(ref))?.value : launchEnvironmentOf(ctx).get(ref)?.value;
	if (hit !== void 0 && hit.length > 0) return assertUsableApiKey(hit, "opencode-live", ref);
	throw new LlmError(`${profile.displayName}: ${hostText(ctx, "The API key is not configured. Enter it in Settings > Models, click \"Save API key\", then send your message again.")}`, "MISSING_CREDENTIAL");
}
/**
* Api-key auth for a route the plugin authenticates itself.
*
* `Models` calls this when the request carries no `apiKey` override (for
* example a status check): it reports the route as unconfigured rather than
* inventing ambient credentials. The per-request key override remains the
* only real authentication path.
* @param name - display name used as the resolution's status label.
* @returns the api-key auth method.
*/
function apiKeyOnlyAuth(name) {
	return {
		name,
		resolve: ({ credential }) => Promise.resolve({
			auth: credential?.key === void 0 ? {} : { apiKey: credential.key },
			source: name
		})
	};
}
/**
* Whether the configured reference is currently set, for status display.
* Presence is reported without ever exposing the value.
* @param ctx - the plugin context.
* @param ref - the credential reference to describe.
* @returns presence facts, or `undefined` without a credential service.
*/
async function describeCredential(ctx, ref) {
	const credentials = ctx.get("credentials");
	if (credentials === void 0) return void 0;
	return credentials.describe(ref);
}
/**
* The stable auth bridge handed to `PiAiAdapter`.
*
* pi-ai requires both members; this plugin's routes authenticate exclusively
* through the per-request key, so the store is inert (nothing to read, no
* sign-in to persist) and the context never answers ambient questions. A
* write attempt is refused loudly rather than silently dropped: a login that
* believed it persisted would fail every later request.
* @returns the injection for `createModels()`.
*/
function staticAuthBridge() {
	return {
		credentials: {
			async read() {},
			async list() {
				return [];
			},
			async modify() {
				throw new LlmError("opencode-live: stored credential sign-ins are not supported; its routes authenticate through the apiKeyEnv reference resolved by the DSH credential service", "NO_CREDENTIAL_STORE");
			},
			async delete() {}
		},
		authContext: {
			async env() {},
			async fileExists() {
				return false;
			}
		}
	};
}
//#endregion
export { apiKeyOnlyAuth, describeCredential, resolveApiKeyFor, staticAuthBridge };
