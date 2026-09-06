import { METADATA_PROVIDER_GO, METADATA_PROVIDER_ZEN, SOURCES, joinProduct, parseMetadataProvider, parseOfficialList } from "./normalize.js";
import { loadCache, restoreOfficialList, saveCache } from "./cache.js";
import { buildSnapshot } from "./snapshot.js";
//#region src/catalog.ts
/** How long one source's decoded body may grow before the read is cut off. */
const OFFICIAL_LIST_MAX_BYTES = 1024 * 1024;
const MODELS_DEV_MAX_BYTES = 32 * 1024 * 1024;
/** Small delay jitter ratio for periodic refresh (multi-profile thundering herd). */
const REFRESH_JITTER_RATIO = .1;
/** Maximum retained length for one diagnostic message. */
const MAX_MESSAGE_CHARS = 300;
/**
* The catalog manager. Construct, `start()`, and `stop()` with the plugin
* fiber; every other method is safe from any async context but must not be
* called after `stop()`.
*/
var CatalogManager = class {
	fetchImpl;
	now;
	onChange;
	warn;
	configValue;
	sources = /* @__PURE__ */ new Map();
	snapshot;
	inFlight = /* @__PURE__ */ new Map();
	timer;
	lifecycle = new AbortController();
	disposed = false;
	firstListResolve;
	constructor(options) {
		this.configValue = options.config;
		this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
		this.now = options.now ?? (() => Date.now());
		this.onChange = options.onChange;
		this.warn = options.warn ?? (() => {});
		this.sources.set("zen-list", { state: {} });
		this.sources.set("go-list", { state: {} });
		this.sources.set("models-dev", { state: {} });
	}
	/** The active catalog configuration. */
	get config() {
		return this.configValue;
	}
	/** The currently published snapshot, if one has been built. */
	get current() {
		return this.snapshot;
	}
	/**
	* Restore cached source payloads (if valid), publish an initial snapshot,
	* run the first refresh to completion, and arm the periodic timer.
	* The composition never awaits this; tests do, for determinism.
	*/
	async start() {
		if (this.disposed) return;
		await this.restoreFromCache();
		this.publish();
		await this.refresh();
		if (this.disposed) return;
		this.scheduleNextRefresh();
	}
	/**
	* Stop timers, abort in-flight fetches, and refuse every late completion:
	* a disposed manager never publishes, saves, or re-arms.
	*/
	stop() {
		this.disposed = true;
		this.lifecycle.abort();
		if (this.timer !== void 0) clearTimeout(this.timer);
		this.timer = void 0;
		this.inFlight.clear();
	}
	/** Apply new catalog configuration values; re-arms the periodic timer. */
	reconfigure(config) {
		if (this.disposed) return;
		this.configValue = { ...config };
		this.scheduleNextRefresh();
	}
	/**
	* Refresh the given products' sources (all when omitted). Concurrent calls
	* coalesce per source: a fetch already in flight is joined, not repeated.
	* `force` bypasses nothing here — single-flight is the TTL — the caller
	* uses the flag only to skip its own TTL checks.
	* @param options - which products to cover and a cancellation signal.
	*/
	async refresh(options = {}) {
		if (this.disposed) return;
		const products = options.products ?? ["zen", "go"];
		const wantsZen = products.includes("zen");
		const wantsGo = products.includes("go");
		const tasks = [];
		if (wantsZen) tasks.push(this.singleFlight("zen", "zen-list", options.signal));
		if (wantsGo) tasks.push(this.singleFlight("go", "go-list", options.signal));
		if (wantsZen || wantsGo) tasks.push(this.singleFlight("both", "models-dev", options.signal));
		await Promise.all(tasks);
	}
	/**
	* Force one refresh for a product and wait for it, joining any fetch that
	* is already running. Used by the unknown-model path; the "once" budget is
	* the caller's to enforce per selection attempt.
	* @param product - the product whose sources must refresh.
	*/
	async forceRefreshOnce(product) {
		await this.refresh({ products: [product] });
	}
	/**
	* Bounded wait for the first usable data. Resolves immediately when any
	* source has ever validated (including a restored cache); otherwise waits
	* up to `timeoutMs` for the in-flight first refresh.
	* @param timeoutMs - the wait bound.
	* @returns whether any data is available when the wait ends.
	*/
	async ensureInitial(timeoutMs) {
		if (this.hasAnySuccess()) return { gotData: true };
		if (this.disposed) return { gotData: false };
		return { gotData: await new Promise((resolve) => {
			let settled = false;
			const done = (value) => {
				if (settled) return;
				settled = true;
				this.firstListResolve = void 0;
				clearTimeout(handle);
				resolve(value);
			};
			this.firstListResolve = () => done(true);
			const handle = setTimeout(() => done(false), timeoutMs);
			if (this.hasAnySuccess()) done(true);
		}) };
	}
	/**
	* Trigger a background revalidation of one product's official list when the
	* last check is older than the revalidation TTL. Non-blocking: selection
	* latency must not depend on a network round trip.
	* @param product - the product whose list is being displayed or selected.
	*/
	revalidateIfNeeded(product) {
		if (this.disposed) return;
		const lastCheckedAt = (this.sources.get(product === "zen" ? "zen-list" : "go-list")?.state)?.lastCheckedAt;
		if (lastCheckedAt !== void 0 && this.now() - lastCheckedAt < this.config.listRevalidateAfterMs) return;
		this.refresh({ products: [product] }).catch(() => {});
	}
	/** Whether any source has ever validated for this instance. */
	hasAnySuccess() {
		for (const source of this.sources.values()) if (source.state.lastSuccessfulAt !== void 0) return true;
		return false;
	}
	/** Single-flight wrapper: one running fetch per source key. */
	singleFlight(scope, sourceId, signal) {
		const running = this.inFlight.get(sourceId);
		if (running !== void 0) return running;
		const task = this.runFetch(scope, sourceId, signal).catch((error) => {
			if (!this.disposed) this.warn(`opencode-live: refreshing "${sourceId}" failed unexpectedly: ${describeError(error)}`);
		}).finally(() => {
			if (this.inFlight.get(sourceId) === task) this.inFlight.delete(sourceId);
		});
		this.inFlight.set(sourceId, task);
		return task;
	}
	/** Fetch one source, update its runtime state, and publish. */
	async runFetch(scope, sourceId, signal) {
		const source = this.sources.get(sourceId);
		if (source === void 0) return;
		const startedAt = this.now();
		source.state = {
			...source.state,
			lastCheckedAt: startedAt
		};
		const outcome = await this.fetchSource(sourceId, source, signal);
		if (this.disposed) return;
		if (outcome.kind === "failed") source.state = {
			...source.state,
			lastErrorCode: outcome.code,
			lastErrorMessage: outcome.message.slice(0, MAX_MESSAGE_CHARS)
		};
		else {
			const { lastErrorCode: _code, lastErrorMessage: _message, ...prior } = source.state;
			source.state = {
				...prior,
				lastSuccessfulAt: this.now(),
				..."etag" in outcome && outcome.etag !== void 0 ? { etag: outcome.etag } : {}
			};
			if (outcome.kind === "official") source.official = outcome.list;
			if (outcome.kind === "metadata") {
				source.providers = outcome.providers;
				source.rawProviders = collectRawProviders(outcome.providers);
			}
			if (sourceId !== "models-dev") this.firstListResolve?.();
		}
		this.publish();
		await this.persistCache(sourceId);
	}
	/** Perform the HTTP fetch and payload validation for one source. */
	async fetchSource(sourceId, source, signal) {
		const isMetadata = sourceId === "models-dev";
		const url = isMetadata ? SOURCES.metadataUrl : sourceId === "zen-list" ? SOURCES.zen.modelsUrl : SOURCES.go.modelsUrl;
		const headers = {};
		if (source.state.etag !== void 0) headers["if-none-match"] = source.state.etag;
		const maxBytes = isMetadata ? MODELS_DEV_MAX_BYTES : OFFICIAL_LIST_MAX_BYTES;
		const controller = new AbortController();
		const abort = () => controller.abort();
		signal?.addEventListener("abort", abort, { once: true });
		this.lifecycle.signal.addEventListener("abort", abort, { once: true });
		const timeout = setTimeout(abort, this.config.timeoutMs);
		try {
			const response = await this.fetchImpl(url, {
				method: "GET",
				headers,
				signal: controller.signal,
				redirect: "error"
			});
			if (response.status === 304) return { kind: "unchanged" };
			if (!response.ok) return {
				kind: "failed",
				code: "HTTP_STATUS",
				message: `GET ${url} answered HTTP ${response.status}`
			};
			const body = await readBoundedBody(response, maxBytes);
			let parsed;
			try {
				parsed = JSON.parse(new TextDecoder().decode(body));
			} catch {
				return {
					kind: "failed",
					code: "INVALID_JSON",
					message: `GET ${url} returned a body that is not JSON`
				};
			}
			if (isMetadata) {
				const providers = /* @__PURE__ */ new Map();
				for (const providerId of [METADATA_PROVIDER_ZEN, METADATA_PROVIDER_GO]) {
					const parsedProvider = parseMetadataProvider(parsed, providerId);
					if (!parsedProvider.ok) return {
						kind: "failed",
						code: parsedProvider.code,
						message: `models.dev slice "${providerId}": ${parsedProvider.message}`
					};
					providers.set(providerId, parsedProvider.value);
				}
				return {
					kind: "metadata",
					providers,
					...readEtag(response)
				};
			}
			const parsedList = parseOfficialList(parsed);
			if (!parsedList.ok) return {
				kind: "failed",
				code: parsedList.code,
				message: `${url}: ${parsedList.message}`
			};
			if (parsedList.value.models.size === 0) return {
				kind: "failed",
				code: "EMPTY_LIST",
				message: `${url} listed zero models`
			};
			return {
				kind: "official",
				list: parsedList.value,
				...readEtag(response)
			};
		} catch (error) {
			if (signal?.aborted) return {
				kind: "failed",
				code: "ABORTED",
				message: "caller cancelled the refresh"
			};
			if (this.disposed) return {
				kind: "failed",
				code: "ABORTED",
				message: "plugin unloaded during refresh"
			};
			if (controller.signal.aborted) return {
				kind: "failed",
				code: "TIMEOUT",
				message: `GET ${url} exceeded ${this.config.timeoutMs}ms`
			};
			if (error?.code === "TOO_LARGE") return {
				kind: "failed",
				code: "TOO_LARGE",
				message: `GET ${url} body exceeded the ${maxBytes}-byte limit`
			};
			return {
				kind: "failed",
				code: "NETWORK",
				message: `GET ${url} failed: ${describeError(error)}`
			};
		} finally {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abort);
		}
	}
	/** Publish the current join over every source's best available data. */
	publish() {
		const now = this.now();
		const states = /* @__PURE__ */ new Map([
			["zen-list", Object.freeze({ ...this.sources.get("zen-list")?.state })],
			["go-list", Object.freeze({ ...this.sources.get("go-list")?.state })],
			["models-dev", Object.freeze({ ...this.sources.get("models-dev")?.state })]
		]);
		const previous = this.snapshot;
		const products = {
			zen: joinProduct("zen", {
				official: this.officialInput("zen-list"),
				metadata: this.metadataInput(METADATA_PROVIDER_ZEN),
				previousOfficialIds: previousOfficialIds(previous, "zen")
			}),
			go: joinProduct("go", {
				official: this.officialInput("go-list"),
				metadata: this.metadataInput(METADATA_PROVIDER_GO),
				previousOfficialIds: previousOfficialIds(previous, "go")
			})
		};
		this.snapshot = buildSnapshot(previous, {
			products,
			sources: states,
			maxStaleMs: this.config.maxStaleMs,
			now
		});
		this.onChange?.(this.snapshot);
	}
	/** The official-list join input for one product, if any was ever validated. */
	officialInput(sourceId) {
		const source = this.sources.get(sourceId);
		if (source === void 0 || source.official === void 0) return void 0;
		return {
			list: source.official,
			...source.state.lastCheckedAt !== void 0 ? { checkedAt: source.state.lastCheckedAt } : {},
			...source.state.lastSuccessfulAt !== void 0 ? { successfulAt: source.state.lastSuccessfulAt } : {}
		};
	}
	/** The metadata join input for one Models.dev provider, if ever validated. */
	metadataInput(providerId) {
		const source = this.sources.get("models-dev");
		const provider = source?.providers?.get(providerId);
		if (source === void 0 || provider === void 0) return void 0;
		return {
			provider,
			...source.state.lastCheckedAt !== void 0 ? { checkedAt: source.state.lastCheckedAt } : {},
			...source.state.lastSuccessfulAt !== void 0 ? { successfulAt: source.state.lastSuccessfulAt } : {}
		};
	}
	/** Persist the source that just completed; failures never block the catalog. */
	async persistCache(sourceId) {
		const path = this.config.cachePath;
		if (path === void 0 || this.disposed) return;
		const zen = this.sources.get("zen-list");
		const go = this.sources.get("go-list");
		const metadata = this.sources.get("models-dev");
		try {
			await saveCache(path, {
				...zen?.official !== void 0 ? { zenList: {
					state: zen.state,
					ids: [...zen.official.models.keys()]
				} } : {},
				...go?.official !== void 0 ? { goList: {
					state: go.state,
					ids: [...go.official.models.keys()]
				} } : {},
				...metadata?.providers !== void 0 && metadata.rawProviders !== void 0 ? { modelsDev: {
					state: metadata.state,
					providers: metadata.rawProviders
				} } : {}
			}, this.now());
		} catch (error) {
			this.warn(`opencode-live: saving the catalog cache failed: ${describeError(error)}`);
		}
	}
	/** Restore cached source payloads and their freshness facts. */
	async restoreFromCache() {
		const path = this.config.cachePath;
		if (path === void 0) return;
		const cached = await loadCache(path);
		if (cached === void 0 || this.disposed) return;
		if (cached.zenList !== void 0) {
			const zen = this.sources.get("zen-list");
			if (zen !== void 0) {
				zen.official = restoreOfficialList("zen", cached.zenList);
				zen.state = { ...cached.zenList.state };
			}
		}
		if (cached.goList !== void 0) {
			const go = this.sources.get("go-list");
			if (go !== void 0) {
				go.official = restoreOfficialList("go", cached.goList);
				go.state = { ...cached.goList.state };
			}
		}
		if (cached.modelsDev !== void 0) {
			const metadata = this.sources.get("models-dev");
			if (metadata !== void 0) {
				const providers = /* @__PURE__ */ new Map();
				for (const providerId of [METADATA_PROVIDER_ZEN, METADATA_PROVIDER_GO]) {
					const raw = cached.modelsDev.providers[providerId];
					if (raw === void 0) continue;
					const parsed = parseMetadataProvider({ [providerId]: raw }, providerId);
					if (parsed.ok) providers.set(providerId, parsed.value);
				}
				if (providers.size > 0) {
					metadata.providers = providers;
					metadata.rawProviders = { ...cached.modelsDev.providers };
					metadata.state = { ...cached.modelsDev.state };
				}
			}
		}
	}
	/** Arm the next periodic refresh with jitter. */
	scheduleNextRefresh() {
		if (this.disposed) return;
		if (this.timer !== void 0) clearTimeout(this.timer);
		const base = this.config.refreshIntervalMs;
		const jitter = base * REFRESH_JITTER_RATIO * Math.random();
		this.timer = setTimeout(() => {
			if (this.disposed) return;
			this.refresh().catch(() => {});
			this.scheduleNextRefresh();
		}, Math.min(base + jitter, Number.MAX_SAFE_INTEGER));
	}
};
/** Read the response's ETag header when present. */
function readEtag(response) {
	const etag = response.headers.get("etag");
	return etag !== null && etag.length > 0 ? { etag } : {};
}
/**
* Read a response body with a hard cap on decoded bytes. Content-Length is
* advisory (it sizes the compressed body); the real budget applies to what
* this process actually reads.
*/
async function readBoundedBody(response, maxBytes) {
	const contentLength = response.headers.get("content-length");
	if (contentLength !== null) {
		const declared = Number(contentLength);
		if (Number.isFinite(declared) && declared > maxBytes) throw Object.assign(/* @__PURE__ */ new Error(`body exceeds ${maxBytes} bytes`), { code: "TOO_LARGE" });
	}
	const body = response.body;
	if (body === null) throw Object.assign(/* @__PURE__ */ new Error("empty response body"), { code: "EMPTY_BODY" });
	const reader = body.getReader();
	const chunks = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw Object.assign(/* @__PURE__ */ new Error(`body exceeds ${maxBytes} decoded bytes`), { code: "TOO_LARGE" });
		}
		chunks.push(value);
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return merged;
}
/** The ids a previous snapshot confirmed against one product's official list. */
function previousOfficialIds(snapshot, product) {
	const ids = /* @__PURE__ */ new Set();
	const view = snapshot?.products[product];
	if (view === void 0) return ids;
	for (const candidate of view.candidates.values()) if (candidate.state !== "catalog-only" && candidate.state !== "removed") ids.add(candidate.id);
	return ids;
}
/** Extract raw provider slices for cache storage. */
function collectRawProviders(providers) {
	const raw = {};
	for (const [id, provider] of providers) {
		const models = {};
		for (const [modelId, model] of provider.models) models[modelId] = {
			...model.name === void 0 ? {} : { name: model.name },
			...model.contextWindow === void 0 ? {} : { limit: {
				context: model.contextWindow,
				...model.maxOutputTokens === void 0 ? {} : { output: model.maxOutputTokens }
			} },
			...model.input === void 0 ? {} : { modalities: { input: [...model.input] } },
			...model.tools === "unknown" ? {} : { tool_call: model.tools },
			...model.reasoning === "unknown" ? {} : { reasoning: model.reasoning },
			...model.reasoningEfforts === void 0 ? {} : { reasoning_options: [{
				type: "effort",
				values: [...model.reasoningEfforts]
			}] },
			...model.cost === void 0 ? {} : { cost: model.cost },
			...model.npm === void 0 ? {} : { provider: { npm: model.npm } }
		};
		raw[id] = {
			...provider.npm === void 0 ? {} : { npm: provider.npm },
			models
		};
	}
	return raw;
}
/** One-line safe description of an unknown error. */
function describeError(error) {
	if (error instanceof Error) return error.message;
	return String(error);
}
//#endregion
export { CatalogManager };
