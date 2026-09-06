import { PRODUCT_BY_ROUTE, describeNonReadyState } from "./normalize.js";
import { LlmError } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
//#region src/adapter.ts
/**
* The live OpenCode adapter: catalog awareness on top of the public
* `PiAiAdapter`.
*
* Message conversion, streaming, tool calls, images, replay state, usage,
* cancellation, and idle timeouts stay entirely delegated. This subclass adds
* only what a dynamic catalog requires: waiting for the first catalog data,
* revalidating on display, forcing one refresh for an unknown model, refusing
* non-ready or stale candidates with their reason, and refusing tool-bearing
* requests on models known not to support tools.
*
* Every refusal names the candidate state; nothing is silently dropped and no
* model is substituted.
*
* @module opencode-live/adapter
*/
/**
* pi-ai-backed adapter over the two live OpenCode routes.
*
* Each operation reads the current catalog snapshot, so a published catalog
* change reaches the next request; a prepared call keeps the snapshot its
* generation captured, because the stream it returns is bound to that
* generation's provider.
*/
var LiveOpenCodeAdapter = class extends PiAiAdapter {
	catalog;
	initialWaitMs;
	requireFresh;
	constructor(options) {
		super(options);
		this.catalog = options.catalog;
		this.initialWaitMs = options.initialWaitMs;
		this.requireFresh = options.requireFresh;
	}
	/** Apply updated catalog-related settings without re-registering. */
	updateOptions(options) {
		this.initialWaitMs = options.initialWaitMs;
		this.requireFresh = options.requireFresh;
	}
	/** The product behind one owned route, or the not-owned failure. */
	productOf(provider) {
		const product = PRODUCT_BY_ROUTE[provider];
		if (product === void 0) throw new LlmError(`opencode-live: adapter does not own provider "${provider}"`, "NO_ADAPTER");
		return product;
	}
	/** The candidate for one route/model pair in the current snapshot. */
	candidateOf(provider, model) {
		const snapshot = this.catalog.current;
		if (snapshot === void 0) return void 0;
		return snapshot.products[this.productOf(provider)].candidates.get(model);
	}
	/**
	* Make one route/model pair selectable: wait for initial data, revalidate
	* the list if its TTL expired, and force exactly one refresh for an unknown
	* id before refusing with the candidate's state.
	* @param provider - the route the request names.
	* @param model - the exact model id the request names.
	*/
	async ensureSelectable(provider, model) {
		const product = this.productOf(provider);
		await this.catalog.ensureInitial(this.initialWaitMs);
		this.catalog.revalidateIfNeeded(product);
		let candidate = this.candidateOf(provider, model);
		if (candidate === void 0) {
			await this.catalog.forceRefreshOnce(product);
			candidate = this.candidateOf(provider, model);
		}
		if (candidate === void 0) throw new LlmError(`opencode-live: product "${product}" has no model "${model}" in the current catalog`, "UNKNOWN_MODEL");
		if (candidate.state !== "ready") throw new LlmError(`opencode-live: model "${model}" on "${product}" is not executable: ${describeNonReadyState(candidate)}`, "UNKNOWN_MODEL");
		const view = this.catalog.current?.products[product];
		if (this.requireFresh && view?.stale === true) throw new LlmError(`opencode-live: the official "${product}" list is stale and catalog.requireFresh is set; refresh the catalog or relax the setting`, "STALE_CATALOG");
	}
	/** Refuse tool-bearing requests on models known not to support tools. */
	guardTools(options) {
		if (options.tools === void 0 || options.tools.length === 0) return;
		if (this.candidateOf(options.provider, options.model)?.tools === false) throw new LlmError(`opencode-live: model "${options.model}" on "${options.provider}" does not support tool calls; send this request without tools or select a tool-capable model`, "UNSUPPORTED_CAPABILITY");
	}
	async listModels(provider) {
		const product = this.productOf(provider);
		await this.catalog.ensureInitial(this.initialWaitMs);
		this.catalog.revalidateIfNeeded(product);
		return super.listModels(provider);
	}
	async resolveModel(provider, model, signal) {
		await this.ensureSelectable(provider, model);
		return super.resolveModel(provider, model, signal);
	}
	async prepareCall(provider, model, signal) {
		await this.ensureSelectable(provider, model);
		const prepared = await super.prepareCall(provider, model, signal);
		return {
			model: prepared.model,
			stream: (options) => {
				this.guardTools(options);
				return prepared.stream(options);
			}
		};
	}
	stream(options) {
		this.guardTools(options);
		return super.stream(options);
	}
};
//#endregion
export { LiveOpenCodeAdapter };
