import { PRODUCT_BY_ROUTE, ROUTE_BY_PRODUCT } from "./normalize.js";
import { RetryPolicySchema, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
//#region src/config.ts
/**
* Non-secret configuration schema for the `opencode-live` plugin.
*
* The composition base (cordis.patch.yml) and the optional user-settings
* section share this schema. Configuration carries references, never secret
* values: the API key is named through `apiKeyEnv` and resolved per request
* through the DSH credential seam.
*
* The plugin owns exactly two fixed routes. A provider entry keyed anything
* else, or keyed with the wrong product, is refused where it is written.
*
* @module opencode-live/config
*/
/** Upper bound shared with DSH's timer facilities. */
const MAX_TIMER_DELAY_MS = 2147483647;
/** The credential reference both OpenCode products document. */
const DEFAULT_API_KEY_ENV = "OPENCODE_API_KEY";
/** Settings-schema defaults published to Client Settings descriptors. */
const DEFAULT_PROVIDERS = {
	[ROUTE_BY_PRODUCT.zen]: {
		product: "zen",
		apiKeyEnv: DEFAULT_API_KEY_ENV
	},
	[ROUTE_BY_PRODUCT.go]: {
		product: "go",
		apiKeyEnv: DEFAULT_API_KEY_ENV
	}
};
const DEFAULT_REFRESH_INTERVAL_MS = 9e5;
const DEFAULT_LIST_REVALIDATE_AFTER_MS = 6e4;
const DEFAULT_TIMEOUT_MS = 15e3;
const DEFAULT_MAX_STALE_MS = 6048e5;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;
const productSchema = z.union([z.const("zen").required(), z.const("go").required()]);
const providerSchema = z.object({
	product: productSchema,
	apiKeyEnv: z.string().role("credential-ref"),
	displayName: z.string(),
	headers: z.dict(z.string()),
	retryPolicy: RetryPolicySchema,
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS)
});
const catalogSchema = z.object({
	refreshIntervalMs: z.number().step(1).min(1),
	listRevalidateAfterMs: z.number().step(1).min(1),
	timeoutMs: z.number().step(1).min(1),
	maxStaleMs: z.number().step(1).min(1),
	requireFresh: z.boolean(),
	cachePath: z.string()
});
/** Runtime schema for {@link Config}. */
const Config = z.object({
	providers: z.dict(providerSchema).default(DEFAULT_PROVIDERS),
	catalog: catalogSchema.default({})
});
/** Whether one number is a positive finite integer within timer bounds. */
function isBoundedPositiveInteger(value, max) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max;
}
/** Validate one bounded catalog interval field. */
function requireInterval(value, fallback, label, max = MAX_TIMER_DELAY_MS) {
	const resolved = value ?? fallback;
	if (!isBoundedPositiveInteger(resolved, max)) throw new Error(`opencode-live: catalog.${label} must be a positive integer no greater than ${max}`);
	return resolved;
}
/**
* Validate configuration and resolve every default. This is the one explicit
* resolve step; an invalid route key, a product/route mismatch, or an out-of
* -bound interval fails loudly here instead of disabling a route silently.
* @param config - the raw configuration value.
* @returns detached validated configuration.
*/
function resolveConfig(config) {
	const providers = /* @__PURE__ */ new Map();
	const entries = Object.entries(config.providers ?? {});
	if (entries.length === 0) for (const route of [ROUTE_BY_PRODUCT.zen, ROUTE_BY_PRODUCT.go]) providers.set(route, resolveProvider(route, {
		product: PRODUCT_BY_ROUTE[route],
		apiKeyEnv: DEFAULT_API_KEY_ENV
	}));
	for (const [route, source] of entries) {
		if (route !== ROUTE_BY_PRODUCT.zen && route !== ROUTE_BY_PRODUCT.go) throw new Error(`opencode-live: provider "${route}" is not a route this plugin owns; the fixed routes are ${ROUTE_BY_PRODUCT.zen} and ${ROUTE_BY_PRODUCT.go}`);
		const resolved = resolveProvider(route, source);
		if (providers.get(resolved.route) !== void 0) throw new Error(`opencode-live: provider "${route}" is declared twice`);
		providers.set(resolved.route, resolved);
	}
	return {
		providers,
		catalog: {
			refreshIntervalMs: requireInterval(config.catalog?.refreshIntervalMs, DEFAULT_REFRESH_INTERVAL_MS, "refreshIntervalMs"),
			listRevalidateAfterMs: requireInterval(config.catalog?.listRevalidateAfterMs, DEFAULT_LIST_REVALIDATE_AFTER_MS, "listRevalidateAfterMs"),
			timeoutMs: requireInterval(config.catalog?.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs"),
			maxStaleMs: requireInterval(config.catalog?.maxStaleMs, DEFAULT_MAX_STALE_MS, "maxStaleMs"),
			requireFresh: config.catalog?.requireFresh ?? false,
			...config.catalog?.cachePath !== void 0 ? { cachePath: requireCachePath(config.catalog.cachePath) } : {}
		}
	};
}
/** Validate one provider entry against its fixed route. */
function resolveProvider(route, source) {
	const product = source.product ?? PRODUCT_BY_ROUTE[route];
	if (PRODUCT_BY_ROUTE[route] !== product) throw new Error(`opencode-live: provider "${route}" declares product "${source.product}", but this route serves "${PRODUCT_BY_ROUTE[route]}"`);
	const apiKeyEnv = credentialRef(source.apiKeyEnv ?? "OPENCODE_API_KEY");
	const streamIdleTimeoutMs = source.streamIdleTimeoutMs ?? 3e5;
	if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`opencode-live: provider "${route}" streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	if (source.displayName !== void 0 && source.displayName.length === 0) throw new Error(`opencode-live: provider "${route}" has an empty displayName`);
	assertValidHeaders(route, source.headers);
	return {
		route,
		product,
		apiKeyEnv,
		displayName: source.displayName ?? defaultDisplayName(route),
		...source.headers !== void 0 ? { headers: { ...source.headers } } : {},
		retryPolicy: resolveRetryPolicy(source.retryPolicy, `opencode-live: provider "${route}" retryPolicy`),
		streamIdleTimeoutMs
	};
}
/** The default display name for one fixed route. */
function defaultDisplayName(route) {
	return route === ROUTE_BY_PRODUCT.zen ? "OpenCode Zen (Live)" : "OpenCode Go (Live)";
}
/** Reject a header Fetch cannot carry, naming the route and field. */
function assertValidHeaders(route, headers) {
	for (const [name, value] of Object.entries(headers ?? {})) try {
		new Headers([[name, value]]);
	} catch {
		throw new Error(`opencode-live: provider "${route}" header "${name}" is not valid for Fetch; use a valid HTTP field name and a single-line value representable as bytes`);
	}
}
/** Validate the optional cache path override. */
function requireCachePath(path) {
	if (path.length === 0) throw new Error("opencode-live: catalog.cachePath must be a non-empty path when set");
	return path;
}
/**
* Refuse a section this plugin could not serve. Registered as the settings
* namespace's validator so an invalid route or interval is rejected where it
* is written instead of silently disabling a route.
* @param config - the resolved section to check.
* @throws Error naming the offending configuration entry.
*/
function assertServiceable(config) {
	resolveConfig(config);
}
//#endregion
export { Config, DEFAULT_API_KEY_ENV, DEFAULT_LIST_REVALIDATE_AFTER_MS, DEFAULT_MAX_REQUEST_IMAGE_BYTES, DEFAULT_MAX_STALE_MS, DEFAULT_PROVIDERS, DEFAULT_REFRESH_INTERVAL_MS, DEFAULT_REQUEST_IMAGE_MAX_BYTES, DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET, DEFAULT_STREAM_IDLE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, assertServiceable, resolveConfig };
