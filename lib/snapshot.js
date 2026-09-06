import { createHash } from "node:crypto";
//#region src/snapshot.ts
/**
* Generational immutable catalog snapshots.
*
* A snapshot is a frozen view of the candidates plus per-source freshness
* facts. Its identity is a content hash over the model-meaningful information
* only — never over fetch timestamps — so a periodic re-check that confirms
* the catalog is unchanged does not rebuild providers or notify the registry.
*
* Everything published here is frozen. Later refreshes build a new snapshot;
* no published map, array, or descriptor is ever mutated, and an in-flight
* request that captured one snapshot keeps reading exactly what it captured.
*
* @module opencode-live/snapshot
*/
const EMPTY_COUNTS = Object.freeze({
	ready: 0,
	"metadata-pending": 0,
	"unsupported-protocol": 0,
	"catalog-only": 0,
	removed: 0
});
/** Deterministic serialization: sorted object keys, stable collection order. */
function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (typeof value === "object" && value !== null) return `{${Object.entries(value).filter(([, member]) => member !== void 0).sort(([left], [right]) => left.localeCompare(right)).map(([key, member]) => `${JSON.stringify(key)}:${stableStringify(member)}`).join(",")}}`;
	return JSON.stringify(value) ?? "null";
}
/** Hash the model-meaningful content of one snapshot's candidates. */
function contentHash(products) {
	const digest = createHash("sha256");
	for (const product of ["zen", "go"]) {
		digest.update(product);
		const models = [...products[product].values()].sort((left, right) => left.id.localeCompare(right.id));
		digest.update(stableStringify(models.map((model) => ({
			id: model.id,
			state: model.state,
			api: model.api,
			name: model.name,
			contextWindow: model.contextWindow,
			maxOutputTokens: model.maxOutputTokens,
			maxInputTokens: model.maxInputTokens,
			input: [...model.input],
			tools: model.tools,
			reasoning: model.reasoning,
			reasoningEfforts: model.reasoningEfforts === void 0 ? void 0 : [...model.reasoningEfforts],
			cost: model.cost,
			missing: [...model.missing]
		}))));
	}
	return digest.digest("hex");
}
/**
* Build the next snapshot. The generation increments only when the content
* hash changes; a confirming re-check yields a new snapshot object with fresh
* freshness facts but the same generation and the same frozen candidate maps.
* @param previous - the snapshot currently published, if any.
* @param inputs - what this build has available.
* @returns the snapshot to publish.
*/
function buildSnapshot(previous, inputs) {
	const hash = contentHash(inputs.products);
	const changed = previous === void 0 || previous.contentHash !== hash;
	const products = Object.freeze(Object.fromEntries(["zen", "go"].map((product) => {
		const candidates = changed ? inputs.products[product] : previous.products[product].candidates;
		const counts = { ...EMPTY_COUNTS };
		const readyIds = [];
		for (const [id, candidate] of candidates) {
			counts[candidate.state] += 1;
			if (candidate.state === "ready") readyIds.push(id);
		}
		const officialState = inputs.sources.get(product === "zen" ? "zen-list" : "go-list");
		const officialConfirmed = officialState?.lastSuccessfulAt !== void 0;
		const stale = officialConfirmed && (officialState.lastSuccessfulAt === void 0 || inputs.now - officialState.lastSuccessfulAt > inputs.maxStaleMs);
		return [product, Object.freeze({
			candidates,
			readyIds: Object.freeze(readyIds),
			stale,
			officialConfirmed,
			counts: Object.freeze(counts)
		})];
	})));
	return Object.freeze({
		generation: changed ? (previous?.generation ?? 0) + 1 : previous.generation,
		createdAt: inputs.now,
		contentHash: hash,
		products,
		sources: inputs.sources
	});
}
/** A hash over each product's ready set; registration replacement keys on this. */
function readySetHash(snapshot) {
	return stableStringify({
		zen: snapshot.products.zen.readyIds,
		go: snapshot.products.go.readyIds
	});
}
//#endregion
export { buildSnapshot, readySetHash };
