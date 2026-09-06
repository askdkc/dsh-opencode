//#region src/normalize.ts
/** DSH route keys this plugin registers; fixed for the plugin's lifetime. */
const ROUTE_ZEN = "opencode-zen-live";
const ROUTE_GO = "opencode-go-live";
const ROUTE_BY_PRODUCT = {
	zen: ROUTE_ZEN,
	go: ROUTE_GO
};
const PRODUCT_BY_ROUTE = {
	[ROUTE_ZEN]: "zen",
	[ROUTE_GO]: "go"
};
/**
* The fixed public sources. Only these URLs are fetched for catalog data, and
* only the fixed product endpoints receive inference traffic; Models.dev
* metadata never becomes a request destination.
*/
const SOURCES = {
	zen: {
		modelsUrl: "https://opencode.ai/zen/v1/models",
		baseUrl: "https://opencode.ai/zen/v1",
		metadataProvider: "opencode"
	},
	go: {
		modelsUrl: "https://opencode.ai/zen/go/v1/models",
		baseUrl: "https://opencode.ai/zen/go/v1",
		metadataProvider: "opencode-go"
	},
	metadataUrl: "https://models.dev/api.json"
};
/** The models.dev provider id holding Zen model metadata. */
const METADATA_PROVIDER_ZEN = SOURCES.zen.metadataProvider;
/** The models.dev provider id holding Go model metadata. */
const METADATA_PROVIDER_GO = SOURCES.go.metadataProvider;
/**
* Models.dev SDK identifiers verified against the wire APIs OpenCode Zen / Go
* actually expose. Model-level `provider.npm` wins over the provider default.
* Anything else is an unknown protocol: the model stays visible as
* `unsupported-protocol` and is never executed, and no npm package named by
* fetched data is ever installed or imported.
*/
const SDK_WIRE_APIS = {
	"@ai-sdk/openai-compatible": "openai-completions",
	"@ai-sdk/openai": "openai-responses",
	"@ai-sdk/anthropic": "anthropic-messages",
	"@ai-sdk/google": "google-generative-ai"
};
/** The modalities this plugin's adapter stack can actually carry. */
const SUPPORTED_INPUT = ["text", "image"];
/** The missing-information labels a diagnostic may name, in display order. */
const MISSING_ORDER = [
	"metadata",
	"name",
	"context",
	"output",
	"input",
	"api"
];
/** Whether one number is a positive finite safe integer. */
function isPositiveInteger(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
/** Whether one value is a non-empty plain string. */
function isNonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}
/**
* Validate an official `/models` response body.
*
* Only a JSON object shaped `{object: 'list', data: [...]}` with a
* duplicate-free, non-empty id set counts. An empty list is a valid JSON body
* but a catalog anomaly: the caller treats `ok: true` with zero models as an
* abnormal candidate and keeps the previous set, which is why emptiness is
* reported on the value rather than as a parse failure.
* @param body - the fetched JSON value.
* @returns the validated model list, or the reason it was refused.
*/
function parseOfficialList(body) {
	if (typeof body !== "object" || body === null) return {
		ok: false,
		code: "INVALID_JSON",
		message: "body is not a JSON object"
	};
	const record = body;
	if (!Array.isArray(record.data)) return {
		ok: false,
		code: "INVALID_JSON",
		message: "data is not an array"
	};
	const models = /* @__PURE__ */ new Map();
	for (const entry of record.data) {
		if (typeof entry !== "object" || entry === null) return {
			ok: false,
			code: "INVALID_JSON",
			message: "data entry is not an object"
		};
		const item = entry;
		if (!isNonEmptyString(item.id)) return {
			ok: false,
			code: "INVALID_JSON",
			message: "data entry has no id"
		};
		if (models.has(item.id)) return {
			ok: false,
			code: "DUPLICATE_ID",
			message: `duplicate model id "${item.id}"`
		};
		models.set(item.id, {
			id: item.id,
			...isPositiveInteger(item.created) ? { created: item.created } : {},
			...isNonEmptyString(item.owned_by) ? { ownedBy: item.owned_by } : {}
		});
	}
	return {
		ok: true,
		value: { models }
	};
}
/**
* Validate the slice of the Models.dev `api.json` this plugin consumes for
* one provider. Unknown extra fields are ignored; every consumed field is
* type-checked, and a consumed field of the wrong type is a refusal, not a
* silent default.
* @param body - the fetched JSON value.
* @param providerId - the Models.dev provider id to extract.
* @returns the validated provider metadata, or the reason it was refused.
*/
function parseMetadataProvider(body, providerId) {
	if (typeof body !== "object" || body === null) return {
		ok: false,
		code: "INVALID_JSON",
		message: "body is not a JSON object"
	};
	const provider = body[providerId];
	if (typeof provider !== "object" || provider === null) return {
		ok: false,
		code: "INVALID_JSON",
		message: `provider "${providerId}" is missing`
	};
	const providerRecord = provider;
	const rawModels = providerRecord.models;
	if (typeof rawModels !== "object" || rawModels === null) return {
		ok: false,
		code: "INVALID_JSON",
		message: `provider "${providerId}" has no models dict`
	};
	const defaultNpm = isNonEmptyString(providerRecord.npm) ? providerRecord.npm : void 0;
	const models = /* @__PURE__ */ new Map();
	for (const [id, raw] of Object.entries(rawModels)) {
		if (!isNonEmptyString(id) || typeof raw !== "object" || raw === null) continue;
		const parsed = parseMetadataModel(id, raw, defaultNpm);
		if (!parsed.ok) return parsed;
		models.set(id, parsed.value);
	}
	return {
		ok: true,
		value: {
			...defaultNpm === void 0 ? {} : { npm: defaultNpm },
			models
		}
	};
}
/** Validate one Models.dev model entry against the fields this plugin consumes. */
function parseMetadataModel(id, raw, defaultNpm) {
	const npm = readNpm(raw.provider) ?? defaultNpm;
	const limit = readLimit(raw.limit);
	const modalities = readModalities(raw.modalities);
	const reasoningOptions = readReasoningOptions(raw.reasoning_options);
	if (reasoningOptions && !reasoningOptions.ok) return {
		ok: false,
		code: "INVALID_JSON",
		message: `model "${id}" has invalid reasoning_options`
	};
	const reasoning = readCapability(raw.reasoning);
	const tools = readCapability(raw.tool_call);
	const cost = readCost(raw.cost);
	return {
		ok: true,
		value: {
			...isNonEmptyString(raw.name) ? { name: raw.name } : {},
			...limit?.context !== void 0 ? { contextWindow: limit.context } : {},
			...limit?.output !== void 0 ? { maxOutputTokens: limit.output } : {},
			...modalities !== void 0 ? { input: modalities } : {},
			tools,
			reasoning,
			...reasoningOptions?.ok && reasoningOptions.efforts !== void 0 && reasoningOptions.efforts.length > 0 ? { reasoningEfforts: reasoningOptions.efforts } : {},
			...cost,
			...npm === void 0 ? {} : { npm }
		}
	};
}
/** Read a models.dev per-model `provider` dict's npm override. */
function readNpm(provider) {
	if (typeof provider !== "object" || provider === null) return void 0;
	const npm = provider.npm;
	return isNonEmptyString(npm) ? npm : void 0;
}
/** Read the validated `limit` dict. */
function readLimit(limit) {
	if (typeof limit !== "object" || limit === null) return void 0;
	const record = limit;
	return {
		...isPositiveInteger(record.context) ? { context: record.context } : {},
		...isPositiveInteger(record.output) ? { output: record.output } : {}
	};
}
/**
* Read the input modalities, intersected with what this plugin's adapter stack
* can carry. Modalities the metadata names beyond that intersection (pdf,
* video, audio) say nothing about what DSH can send, so they never widen the
* declaration. The intersection is returned only when the metadata supplies a
* list; an absent list is `undefined` ("no answer"), while a list whose
* intersection is empty stays empty and makes the candidate pending.
*/
function readModalities(modalities) {
	if (typeof modalities !== "object" || modalities === null) return void 0;
	const raw = modalities.input;
	if (!Array.isArray(raw)) return void 0;
	const declared = new Set(raw.filter((entry) => isNonEmptyString(entry)));
	return SUPPORTED_INPUT.filter((modality) => declared.has(modality));
}
/** Read a `true`/`false` capability flag, with absence as 'unknown'. */
function readCapability(value) {
	if (value === true) return true;
	if (value === false) return false;
	return "unknown";
}
/**
* Read the verified reasoning-control options. Only an explicit effort list
* verifies which levels a model accepts: `reasoning: true` alone verifies
* nothing about request format, and a toggle verifies nothing about effort
* levels, so both come back as no efforts.
*/
function readReasoningOptions(options) {
	if (!Array.isArray(options)) return { ok: true };
	const efforts = [];
	for (const entry of options) {
		if (typeof entry !== "object" || entry === null) return { ok: false };
		const record = entry;
		if (record.type === "effort") {
			if (!Array.isArray(record.values)) return { ok: false };
			for (const value of record.values) {
				if (!isNonEmptyString(value)) return { ok: false };
				if (!efforts.includes(value)) efforts.push(value);
			}
		} else if (record.type !== "toggle" && record.type !== "budget_tokens") return { ok: false };
	}
	return {
		ok: true,
		...efforts.length > 0 ? { efforts } : {}
	};
}
/** Read one finite number, or nothing. */
function rate(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
/** Read source pricing when it is well-formed; absent pricing is not fabricated. */
function readCost(cost) {
	if (typeof cost !== "object" || cost === null) return {};
	const record = cost;
	const input = rate(record.input);
	const output = rate(record.output);
	if (input === void 0 || output === void 0) return {};
	return { cost: {
		input,
		output,
		cacheRead: rate(record.cache_read) ?? 0,
		cacheWrite: rate(record.cache_write) ?? 0,
		...readCostTiers(record.tiers)
	} };
}
/** Read pricing tiers when well-formed. */
function readCostTiers(tiers) {
	if (!Array.isArray(tiers)) return {};
	const mapped = [];
	for (const entry of tiers) {
		if (typeof entry !== "object" || entry === null) return {};
		const record = entry;
		const threshold = record.tier;
		const size = typeof threshold === "object" && threshold !== null ? threshold.size : void 0;
		if (!isPositiveInteger(size)) return {};
		const input = rate(record.input);
		const output = rate(record.output);
		if (input === void 0 || output === void 0) return {};
		mapped.push({
			input,
			output,
			cacheRead: rate(record.cache_read) ?? 0,
			cacheWrite: rate(record.cache_write) ?? 0,
			inputTokensAbove: size
		});
	}
	return { ...mapped.length > 0 ? { tiers: mapped } : {} };
}
/**
* Join one product's official list with its Models.dev metadata into the
* candidate map. The union of both sources' id sets is preserved: an unknown
* id never disappears for lack of information, it just stops being
* executable.
*
* Deletion is conservative in both directions: a candidate the fresh official
* list no longer names and whose metadata is also gone becomes `removed`;
* one the metadata still names becomes `catalog-only`. A fresh fetch that
* yields no official list at all contributes nothing (the caller keeps the
* previous list for that case).
* @param product - the product being joined.
* @param inputs - the validated source payloads.
* @returns the candidate map, keyed by exact model id.
*/
function joinProduct(product, inputs) {
	const route = ROUTE_BY_PRODUCT[product];
	const officialModels = inputs.official?.list.models;
	const metadataModels = inputs.metadata?.provider.models;
	const ids = /* @__PURE__ */ new Set([...officialModels?.keys() ?? [], ...metadataModels?.keys() ?? []]);
	for (const id of inputs.previousOfficialIds) if (!officialModels?.has(id) && !metadataModels?.has(id)) ids.add(id);
	const candidates = /* @__PURE__ */ new Map();
	for (const id of ids) {
		const metadata = metadataModels?.get(id);
		const official = officialModels?.get(id);
		const wasOfficial = inputs.previousOfficialIds.has(id);
		const inOfficial = official !== void 0;
		const inMetadata = metadata !== void 0;
		let state;
		if (inOfficial && !inMetadata) state = "metadata-pending";
		else if (!inOfficial && inMetadata) state = "catalog-only";
		else if (!inOfficial && !inMetadata) state = "removed";
		else state = "ready";
		const missing = [];
		const npm = metadata?.npm;
		const api = npm !== void 0 ? SDK_WIRE_APIS[npm] : void 0;
		if (!inMetadata) missing.push("metadata");
		if (metadata?.name === void 0) missing.push("name");
		if (metadata?.contextWindow === void 0) missing.push("context");
		if (metadata?.maxOutputTokens === void 0) missing.push("output");
		if (metadata?.input === void 0 || metadata.input.length === 0) missing.push("input");
		if (inMetadata && npm === void 0) missing.push("api");
		if (state === "ready") {
			if (missing.length > 0) state = "metadata-pending";
			else if (api === void 0) state = "unsupported-protocol";
		}
		candidates.set(id, Object.freeze({
			product,
			route,
			id,
			name: metadata?.name ?? id,
			state,
			...api !== void 0 ? { api } : {},
			...metadata?.contextWindow !== void 0 ? { contextWindow: metadata.contextWindow } : {},
			...metadata?.maxOutputTokens !== void 0 ? { maxOutputTokens: metadata.maxOutputTokens } : {},
			input: Object.freeze([...metadata?.input ?? []]),
			tools: metadata?.tools ?? "unknown",
			reasoning: metadata?.reasoning ?? "unknown",
			...metadata?.reasoningEfforts !== void 0 ? { reasoningEfforts: Object.freeze([...metadata.reasoningEfforts]) } : {},
			...metadata?.cost !== void 0 ? { cost: metadata.cost } : {},
			missing: Object.freeze(sortMissing(missing)),
			provenance: Object.freeze({
				official: inOfficial ? SOURCES[product].modelsUrl : wasOfficial ? `${SOURCES[product].modelsUrl} (previously listed)` : "absent",
				metadata: inMetadata ? `${SOURCES.metadataUrl}#${SOURCES[product].metadataProvider}` : "absent",
				...npm !== void 0 ? { npm } : {},
				...inputs.official?.successfulAt !== void 0 ? { officialConfirmedAt: new Date(inputs.official.successfulAt).toISOString() } : {},
				...inputs.metadata?.successfulAt !== void 0 ? { metadataConfirmedAt: new Date(inputs.metadata.successfulAt).toISOString() } : {}
			})
		}));
	}
	return candidates;
}
/** Order the missing-field labels for stable display. */
function sortMissing(missing) {
	return [...missing].sort((left, right) => {
		const leftIndex = MISSING_ORDER.indexOf(left);
		const rightIndex = MISSING_ORDER.indexOf(right);
		return (leftIndex === -1 ? MISSING_ORDER.length : leftIndex) - (rightIndex === -1 ? MISSING_ORDER.length : rightIndex);
	});
}
/** One-line human explanation of a candidate's non-ready state. */
function describeNonReadyState(candidate) {
	switch (candidate.state) {
		case "ready": return "ready";
		case "metadata-pending": return `metadata-pending (missing: ${candidate.missing.join(", ") || "unknown"})`;
		case "unsupported-protocol": return `unsupported-protocol (${candidate.provenance["npm"] ?? "unknown SDK"})`;
		case "catalog-only": return "catalog-only (not in the official product list)";
		case "removed": return "removed (no longer in the official product list)";
	}
}
//#endregion
export { METADATA_PROVIDER_GO, METADATA_PROVIDER_ZEN, PRODUCT_BY_ROUTE, ROUTE_BY_PRODUCT, ROUTE_GO, ROUTE_ZEN, SOURCES, describeNonReadyState, isPositiveInteger, joinProduct, parseMetadataProvider, parseOfficialList };
