import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
/** Whether one stored source state carries only the bounded display facts. */
function isSourceState(value) {
	if (typeof value !== "object" || value === null) return false;
	const record = value;
	return [...Object.values(record)].every((member) => typeof member === "string" || typeof member === "number") && Object.keys(record).every((key) => [
		"lastCheckedAt",
		"lastSuccessfulAt",
		"etag",
		"lastErrorCode",
		"lastErrorMessage"
	].includes(key));
}
/** Whether one stored official list is structurally valid. */
function isCachedOfficialList(value) {
	if (typeof value !== "object" || value === null) return false;
	const record = value;
	return isSourceState(record.state) && typeof record.fetchedAt === "number" && Number.isFinite(record.fetchedAt) && Array.isArray(record.ids) && record.ids.every((id) => typeof id === "string" && id.length > 0);
}
/** Whether one stored Models.dev slice is structurally valid. */
function isCachedModelsDev(value) {
	if (typeof value !== "object" || value === null) return false;
	const record = value;
	if (!isSourceState(record.state) || typeof record.fetchedAt !== "number" || !Number.isFinite(record.fetchedAt) || typeof record.providers !== "object" || record.providers === null) return false;
	return Object.values(record.providers).every((provider) => typeof provider === "object" && provider !== null && typeof provider.models === "object");
}
/**
* Load and validate the cache file. Any structural defect — wrong version,
* wrong normalizer, malformed source entry — refuses the whole file rather
* than trusting a partial restore.
* @param path - the cache file path.
* @returns the cached sources, or `undefined` when absent or invalid.
*/
async function loadCache(path) {
	let raw;
	try {
		const { readFile } = await import("node:fs/promises");
		raw = JSON.parse(await readFile(path, "utf8"));
	} catch {
		return;
	}
	if (typeof raw !== "object" || raw === null) return void 0;
	const file = raw;
	if (file.version !== 1 || file.normalizer !== 1) return void 0;
	if (typeof file.savedAt !== "number" || !Number.isFinite(file.savedAt)) return void 0;
	if (typeof file.sources !== "object" || file.sources === null) return void 0;
	const sources = file.sources;
	const cached = {};
	if (isCachedOfficialList(sources["zen-list"])) cached.zenList = sources["zen-list"];
	if (isCachedOfficialList(sources["go-list"])) cached.goList = sources["go-list"];
	if (isCachedModelsDev(sources["models-dev"])) cached.modelsDev = sources["models-dev"];
	if (cached.zenList === void 0 && cached.goList === void 0 && cached.modelsDev === void 0) return;
	return cached;
}
/**
* Persist the payload under a file lock and an atomic replacement, merging
* per source so a slower writer can never erase a fresher entry another
* completion already stored: each source keeps whichever entry — the stored
* one or the incoming one — validated more recently, and a source the caller
* does not name leaves the stored entry untouched.
*
* A write failure is reported to the caller — the in-memory catalog stays
* usable — and the caller decides what the loss means for later restarts.
* @param path - the cache file path.
* @param payload - the validated source payloads to store.
* @param savedAt - the wall-clock stamp for the entry.
*/
async function saveCache(path, payload, savedAt) {
	const incoming = buildFile(payload, savedAt);
	await withFileLock(path, async () => {
		const existing = await readCacheFile(path);
		const merged = existing === void 0 ? incoming : mergeFiles(existing, incoming);
		await writeFileAtomic(path, JSON.stringify(merged), {
			mode: 384,
			dirMode: 448
		});
	});
}
/** Assemble one cache file image from a payload. */
function buildFile(payload, savedAt) {
	return {
		version: 1,
		normalizer: 1,
		savedAt,
		sources: {
			...payload.zenList === void 0 ? {} : { "zen-list": {
				state: payload.zenList.state,
				fetchedAt: savedAt,
				ids: payload.zenList.ids
			} },
			...payload.goList === void 0 ? {} : { "go-list": {
				state: payload.goList.state,
				fetchedAt: savedAt,
				ids: payload.goList.ids
			} },
			...payload.modelsDev === void 0 ? {} : { "models-dev": {
				state: payload.modelsDev.state,
				fetchedAt: savedAt,
				providers: payload.modelsDev.providers
			} }
		}
	};
}
/** The success stamp ordering one merge decision. */
function successAt(entry) {
	return entry.state.lastSuccessfulAt ?? -1;
}
/**
* Merge two cache file images per source: the entry whose source confirmed
* more recently wins; an equally fresh entry is taken from the incoming file
* because its state carries the most recent check outcome. Sources absent
* from the incoming image keep the stored entry, which is what stops a
* partial or failed refresh from erasing another source's data.
*/
function mergeFiles(existing, incoming) {
	const sources = {};
	const target = sources;
	for (const key of [
		"zen-list",
		"go-list",
		"models-dev"
	]) {
		const prior = existing.sources[key];
		const next = incoming.sources[key];
		if (next === void 0 && prior === void 0) continue;
		if (next === void 0) {
			target[key] = prior;
			continue;
		}
		if (prior === void 0 || successAt(next) >= successAt(prior)) {
			target[key] = next;
			continue;
		}
		target[key] = prior;
	}
	return {
		version: incoming.version,
		normalizer: incoming.normalizer,
		savedAt: Math.max(incoming.savedAt, existing.savedAt),
		sources
	};
}
/** Read and parse the cache file without validation judgment. */
async function readCacheFile(path) {
	try {
		const { readFile } = await import("node:fs/promises");
		const raw = JSON.parse(await readFile(path, "utf8"));
		if (typeof raw !== "object" || raw === null) return void 0;
		const file = raw;
		if (file.version !== 1 || file.normalizer !== 1) return void 0;
		if (typeof file.savedAt !== "number" || !Number.isFinite(file.savedAt)) return void 0;
		if (typeof file.sources !== "object" || file.sources === null) return void 0;
		return file;
	} catch {
		return;
	}
}
/**
* Rebuild a validated official list from stored ids. The ids were validated
* when fetched; restoring keeps them exact.
* @param product - which product's list this is (used only by the caller).
* @param cached - the stored entry.
* @returns the official list shape the normalizer consumes.
*/
function restoreOfficialList(_product, cached) {
	const models = /* @__PURE__ */ new Map();
	for (const id of cached.ids) models.set(id, { id });
	return { models };
}
//#endregion
export { loadCache, restoreOfficialList, saveCache };
