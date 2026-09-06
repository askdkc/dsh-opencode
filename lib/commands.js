import { PRODUCT_BY_ROUTE, ROUTE_BY_PRODUCT, describeNonReadyState } from "./normalize.js";
import "./keyring.js";
//#region src/commands.ts
const USAGE_REFRESH = "Usage: /opencode-refresh [all|zen|go]";
const USAGE_MODELS = "Usage: /opencode-models <zen|go> [--all]";
/** Whether one date stamp renders as a short local time. */
function renderTime(timestamp) {
	if (timestamp === void 0) return "never";
	return new Date(timestamp).toISOString().replace(/\.\d{3}Z$/, "Z");
}
/** One product's status lines. */
async function productStatus(ctx, services, product) {
	const route = ROUTE_BY_PRODUCT[product];
	const view = services.catalog.current?.products[product];
	const facts = await services.describeCredential(route);
	const lines = [
		`${route} (${product}):`,
		`  credential: ${facts === void 0 ? "unknown (no credentials service)" : facts.configured ? "configured" : "not configured"}`,
		`  models ready: ${view?.counts.ready ?? 0}, pending: ${(view?.counts["metadata-pending"] ?? 0) + (view?.counts["unsupported-protocol"] ?? 0)}, catalog-only: ${view?.counts["catalog-only"] ?? 0}, removed: ${view?.counts.removed ?? 0}`
	];
	if (view !== void 0) lines.push(`  official list: ${view.officialConfirmed ? view.stale ? "stale" : "fresh" : "never confirmed"}, last success ${renderTime(services.catalog.current?.sources.get(product === "zen" ? "zen-list" : "go-list")?.lastSuccessfulAt)}`);
	const sources = services.catalog.current?.sources;
	if (sources !== void 0) {
		for (const [id, state] of sources) if (state.lastErrorCode !== void 0) lines.push(`  ${id}: last error ${state.lastErrorCode} at ${renderTime(state.lastCheckedAt)}`);
	}
	return lines.join("\n");
}
/** One candidate's display line for the models listing. */
function candidateLine(candidate, all) {
	if (candidate.state === "ready" && !all) return `  ${candidate.id} — ${candidate.name}${candidate.api === void 0 ? "" : ` [${candidate.api}]`}`;
	if (!all) return "";
	const detail = candidate.state === "ready" ? `ready [${candidate.api ?? "unknown"}]` : describeNonReadyState(candidate);
	return `  ${candidate.id} — ${candidate.name} (${detail})`;
}
/** Parse one product argument. */
function parseProduct(raw) {
	if (raw === "zen") return "zen";
	if (raw === "go") return "go";
}
/** Build the three command definitions. */
function commandDefinitions(ctx, services) {
	return [
		{
			name: "opencode-refresh",
			description: "Refresh the OpenCode Zen/Go model catalogs",
			recordInput: false,
			handler: async (invocation) => {
				const arg = invocation.rawInput.trim();
				const products = arg === "" || arg === "all" ? ["zen", "go"] : parseProduct(arg) !== void 0 ? [parseProduct(arg)] : void 0;
				if (products === void 0) return {
					kind: "error",
					text: USAGE_REFRESH
				};
				if (invocation.signal.aborted) return {
					kind: "success",
					text: "Refresh cancelled."
				};
				try {
					await services.catalog.refresh({
						products,
						signal: invocation.signal
					});
				} catch {}
				const lines = ["Catalog refresh finished."];
				for (const product of products) lines.push(await productStatus(ctx, services, product));
				return {
					kind: "success",
					text: lines.join("\n")
				};
			}
		},
		{
			name: "opencode-status",
			description: "Show OpenCode live catalog and credential status",
			recordInput: false,
			handler: async (invocation) => {
				if (invocation.rawInput.trim().length > 0) return {
					kind: "error",
					text: "Usage: /opencode-status"
				};
				const lines = ["OpenCode live catalog status:"];
				lines.push(await productStatus(ctx, services, "zen"));
				lines.push(await productStatus(ctx, services, "go"));
				const metadata = services.catalog.current?.sources.get("models-dev");
				if (metadata !== void 0) lines.push(`models.dev metadata: last success ${renderTime(metadata.lastSuccessfulAt)}${metadata.lastErrorCode === void 0 ? "" : `, last error ${metadata.lastErrorCode}`}`);
				return {
					kind: "success",
					text: lines.join("\n")
				};
			}
		},
		{
			name: "opencode-models",
			description: "List OpenCode live models, including non-ready candidates with --all",
			recordInput: false,
			handler: async (invocation) => {
				const parts = invocation.rawInput.trim().split(/\s+/).filter((part) => part.length > 0);
				if (parts.length === 0 || parts.length > 2) return {
					kind: "error",
					text: USAGE_MODELS
				};
				const product = parseProduct(parts[0]);
				if (product === void 0) return {
					kind: "error",
					text: USAGE_MODELS
				};
				const all = parts[1] === "--all";
				if (!all && parts.length === 2) return {
					kind: "error",
					text: USAGE_MODELS
				};
				const snapshot = services.catalog.current;
				if (snapshot === void 0) return {
					kind: "success",
					text: `No catalog data for "${product}" yet; try /opencode-refresh ${product}.`
				};
				const view = snapshot.products[product];
				const lines = [`${ROUTE_BY_PRODUCT[product]} (${product})${all ? " — all candidates" : ` — ${view.counts.ready} ready models`}:`];
				const ordered = [...view.candidates.values()].sort((left, right) => left.id.localeCompare(right.id));
				for (const candidate of ordered) {
					const line = candidateLine(candidate, all);
					if (line.length > 0) lines.push(line);
				}
				if (all && view.counts.ready === 0 && ordered.length === 0) lines.push("  (no candidates published yet)");
				return {
					kind: "success",
					text: lines.join("\n")
				};
			}
		},
		{
			name: "dsh-opencode",
			description: "Store the OpenCode API key, or report status",
			input: { hint: "Paste the OpenCode API key here (required only when unset)" },
			recordInput: false,
			handler: async (invocation) => {
				const routes = [ROUTE_BY_PRODUCT.zen, ROUTE_BY_PRODUCT.go];
				const key = invocation.rawInput.trim();
				if (key.length > 0) {
					if (invocation.signal.aborted) return {
						kind: "success",
						text: "Storing cancelled."
					};
					const failure = await services.storeApiKey(key);
					if (failure !== void 0) return {
						kind: "error",
						text: failure
					};
					const lines = ["OpenCode API key stored. Zen and Go are enabled:"];
					for (const route of routes) lines.push(await productStatus(ctx, services, PRODUCT_BY_ROUTE[route]));
					return {
						kind: "success",
						text: lines.join("\n")
					};
				}
				if (!await services.keyConfigured()) return {
					kind: "success",
					text: [
						"No OpenCode API key is configured yet.",
						"Type the key into this command's input field and run again, or export it in the launch environment.",
						...await services.keyReadonly() ? ["The credential reference is read-only in this deployment."] : [],
						"This command never displays key values."
					].join("\n")
				};
				if (invocation.signal.aborted) return {
					kind: "success",
					text: "Refresh cancelled."
				};
				try {
					await services.catalog.refresh({
						products: ["zen", "go"],
						signal: invocation.signal
					});
				} catch {}
				const lines = ["OpenCode API key configured. Zen and Go are enabled:"];
				for (const route of routes) lines.push(await productStatus(ctx, services, PRODUCT_BY_ROUTE[route]));
				return {
					kind: "success",
					text: lines.join("\n")
				};
			}
		}
	];
}
/** Register every host command and return the disposers. */
function registerCommands(ctx, services) {
	return commandDefinitions(ctx, services).map((definition) => ctx.commands.register(definition));
}
//#endregion
export { commandDefinitions, registerCommands };
