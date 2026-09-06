import { SOURCES } from "./normalize.js";
import { createProvider } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
//#region src/transport.ts
/**
* Assembly of the pi-ai `Provider` one live route registers.
*
* Every ready candidate becomes one pi-ai model whose `api` names one of the
* four allowlisted wire protocols and whose `baseUrl` matches how pi-ai's own
* OpenCode providers address the product endpoints: the Anthropic SDK appends
* `/v1/messages` itself, so Anthropic-wire models use the product base
* without `/v1`, while the OpenAI and Google implementations are given the
* fixed `/v1` base.
*
* Model identity stays route-local: the provider id is the DSH route key, and
* the model id is the exact upstream string. Nothing fetched from metadata is
* imported or installed.
*
* The Go product requires honest self-identification and an opaque, stable
* `x-opencode-session` header. The wrapper copies per-request headers rather
* than mutating any shared profile object.
*
* @module opencode-live/transport
*/
/** The plugin's honest client identification value. */
const PLUGIN_ID = "opencode-live";
const PLUGIN_VERSION = "0.1.0";
/** Header OpenCode Go documents for coding-agent session identification. */
const SESSION_HEADER = "x-opencode-session";
/** Header carrying this plugin's honest client identity alongside DSH attribution. */
const CLIENT_HEADER = "x-opencode-client";
/** The lazily loaded wire-protocol implementations, one per allowlisted API. */
const WIRE_APIS = {
	"openai-completions": openAICompletionsApi,
	"openai-responses": openAIResponsesApi,
	"anthropic-messages": anthropicMessagesApi,
	"google-generative-ai": googleGenerativeAIApi
};
/** Every pi-ai thinking level, in escalation order. */
const THINKING_LEVELS = [
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
/**
* Pricing for a model whose metadata names no rates. This is the absence of a
* fact, not a price claim: pi-ai requires numbers, and no consumer of this
* plugin reports spend from them.
*/
const NO_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0
};
/**
* Build the pi-ai provider for one fixed live route over its ready models.
* @param options - the route facts and validated candidates.
* @returns the provider to register into the adapter's `Models` collection.
*/
function buildRouteProvider(options) {
	const models = options.ready.filter((candidate) => candidate.api !== void 0).map((candidate) => toPiModel(candidate, options.route));
	const provider = createProvider({
		id: options.route,
		name: options.displayName,
		baseUrl: SOURCES[options.product].baseUrl,
		auth: options.auth,
		models,
		api: {
			"openai-completions": WIRE_APIS["openai-completions"](),
			"openai-responses": WIRE_APIS["openai-responses"](),
			"anthropic-messages": WIRE_APIS["anthropic-messages"](),
			"google-generative-ai": WIRE_APIS["google-generative-ai"]()
		}
	});
	return options.product === "go" ? withGoSessionHeaders(provider, PLUGIN_VERSION) : provider;
}
/**
* Convert one normalized candidate into a pi-ai model descriptor.
* @param candidate - a `ready` candidate with a resolved wire API.
* @param route - the owning route key; also the pi-ai provider id.
* @returns the descriptor for the route's provider model list.
*/
function toPiModel(candidate, route) {
	const api = candidate.api;
	if (api === void 0) throw new Error(`opencode-live: candidate "${candidate.id}" has no wire API and must not reach provider construction`);
	return {
		id: candidate.id,
		name: candidate.name,
		api,
		provider: route,
		baseUrl: modelBaseUrl(candidate.product, api),
		reasoning: candidate.reasoning === true,
		...thinkingLevelMap(candidate),
		input: [...candidate.input],
		cost: candidate.cost ?? NO_COST,
		contextWindow: candidate.contextWindow,
		maxTokens: candidate.maxOutputTokens
	};
}
/**
* The per-wire-API request base. Anthropic clients append `/v1/messages`
* themselves; the OpenAI and Google clients are handed the fixed `/v1` base,
* matching the verified endpoint layout of the product APIs.
* @param product - the product being addressed.
* @param api - the model's wire protocol.
* @returns the exact base URL the pi-ai implementation receives.
*/
function modelBaseUrl(product, api) {
	const base = SOURCES[product].baseUrl;
	return api === "anthropic-messages" ? base.replace(/\/v1$/, "") : base;
}
/**
* The thinking-level map built only from verified effort values.
*
* A model whose reasoning capability is confirmed but whose control format is
* a toggle (or unpublished) maps every level to `null`: pi-ai then offers no
* effort control and requests keep the provider's default behavior. A model
* with a verified effort list maps supported levels to themselves and marks
* the rest unsupported, so an unverified level is refused rather than sent.
* @param candidate - the normalized candidate.
* @returns the map, or nothing when the model is not reasoning-capable.
*/
function thinkingLevelMap(candidate) {
	if (candidate.reasoning !== true) return {};
	const verified = candidate.reasoningEfforts;
	const map = {};
	for (const level of THINKING_LEVELS) map[level] = verified === void 0 ? null : verified.includes(level) ? level : null;
	return { thinkingLevelMap: map };
}
/**
* Wrap one provider so every Go request carries the session and client
* headers. The wrapping delegates dispatch to the wrapped provider's own
* implementations, so the wire-API map and auth resolution are untouched.
* @param provider - the provider built for the Go route.
* @param version - the plugin version for honest client identification.
* @returns a provider whose requests carry the copied headers.
*/
function withGoSessionHeaders(provider, version) {
	const bySession = /* @__PURE__ */ new Map();
	const byRequest = /* @__PURE__ */ new WeakMap();
	const sessionIdFor = (options) => {
		if (options === void 0) return crypto.randomUUID();
		if (typeof options.sessionId === "string" && options.sessionId.length > 0) {
			const existing = bySession.get(options.sessionId);
			if (existing !== void 0) return existing;
			const created = crypto.randomUUID();
			if (bySession.size >= 512) {
				const oldest = bySession.keys().next().value;
				if (oldest !== void 0) bySession.delete(oldest);
			}
			bySession.set(options.sessionId, created);
			return created;
		}
		const existing = byRequest.get(options);
		if (existing !== void 0) return existing;
		const created = crypto.randomUUID();
		byRequest.set(options, created);
		return created;
	};
	const headersFor = (options) => ({
		...options?.headers,
		[SESSION_HEADER]: sessionIdFor(options),
		[CLIENT_HEADER]: `${PLUGIN_ID}/${version}`
	});
	/**
	* Merge the copied headers into one request's options without mutating the
	* caller's object. The no-options path needs a bounded assertion because
	* `ApiStreamOptions` is a deferred per-API union at this untyped dispatch
	* seam; DSH's inference path (`streamSimple`) stays fully typed.
	*/
	function withHeaders(options) {
		if (options === void 0) return { headers: headersFor(void 0) };
		return {
			...options,
			headers: headersFor(options)
		};
	}
	return {
		...provider,
		stream: (model, context, options) => provider.stream(model, context, withHeaders(options)),
		streamSimple: (model, context, options) => {
			const headers = headersFor(options);
			if (options === void 0) return provider.streamSimple(model, context, { headers });
			return provider.streamSimple(model, context, {
				...options,
				headers
			});
		}
	};
}
//#endregion
export { CLIENT_HEADER, PLUGIN_ID, PLUGIN_VERSION, SESSION_HEADER, buildRouteProvider, modelBaseUrl, toPiModel, withGoSessionHeaders };
