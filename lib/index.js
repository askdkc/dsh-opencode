import { ROUTE_BY_PRODUCT } from "./normalize.js";
import { LiveOpenCodeAdapter } from "./adapter.js";
import { readySetHash } from "./snapshot.js";
import { CatalogManager } from "./catalog.js";
import { Config, DEFAULT_MAX_REQUEST_IMAGE_BYTES, DEFAULT_REQUEST_IMAGE_MAX_BYTES, DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET, assertServiceable, resolveConfig } from "./config.js";
import { apiKeyOnlyAuth, describeCredential, resolveApiKeyFor, staticAuthBridge } from "./credentials.js";
import { registerCommands } from "./commands.js";
import { buildRouteProvider } from "./transport.js";
import { resolveImageAttachmentAccess, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
//#region src/index.ts
/** Cordis plugin name. */
const name = "opencode-live";
/** Services required before the plugin can activate. */
const inject = ["llm"];
/** The settings namespace this plugin owns. */
const SETTINGS_NAMESPACE = "opencode-live";
/**
* Register the plugin against one composition context.
* @param ctx - the Cordis context.
* @param config - the composition base configuration for this plugin.
*/
function apply(ctx, config = {}) {
	const resolved = resolveConfig(config);
	let currentConfig = resolved;
	let configRevision = 0;
	const catalog = new CatalogManager({
		config: {
			...resolved.catalog,
			...resolved.catalog.cachePath === void 0 ? { cachePath: defaultCachePath() } : {}
		},
		onChange: (snapshot) => onCatalogChange(snapshot),
		warn: (message) => ctx.logger.warn(message)
	});
	const adapter = new LiveOpenCodeAdapter({
		profiles,
		resolveApiKey: (route, profile) => resolveApiKeyFor(ctx, route, profile),
		auth: staticAuthBridge(),
		resolveAttachments: () => ctx.get("attachments"),
		resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(attachments, (hostPath) => ctx.get("fs")?.processPathFromHostPath(hostPath), ref),
		catalog,
		initialWaitMs: currentConfig.catalog.timeoutMs,
		requireFresh: currentConfig.catalog.requireFresh,
		onReplayDegrade: ({ provider, model, reason }) => {
			ctx.logger.warn(`opencode-live: unusable replay state on assistant history for route "${provider}/${model}"; sending that message as provider-neutral content (${reason})`);
		}
	});
	/** Memoized profiles keyed by configuration revision and catalog content. */
	let memoKey;
	let memoProfiles;
	function profiles() {
		const key = `${configRevision}:${catalog.current?.contentHash ?? "empty"}`;
		if (memoKey === key && memoProfiles !== void 0) return memoProfiles;
		const map = /* @__PURE__ */ new Map();
		for (const [route, providerConfig] of currentConfig.providers) {
			const view = catalog.current?.products[providerConfig.product];
			const ready = view === void 0 ? [] : view.readyIds.map((id) => view.candidates.get(id)).filter((candidate) => candidate !== void 0);
			map.set(route, {
				provider: route,
				displayName: providerConfig.displayName,
				apiKeyEnv: providerConfig.apiKeyEnv,
				streamIdleTimeoutMs: providerConfig.streamIdleTimeoutMs,
				maxRequestImageBytes: DEFAULT_MAX_REQUEST_IMAGE_BYTES,
				requestImagePixelBudget: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
				requestImageMaxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
				retryPolicy: providerConfig.retryPolicy ?? resolveRetryPolicy(void 0, `opencode-live: provider "${route}" retryPolicy`),
				...providerConfig.headers !== void 0 ? { headers: { ...providerConfig.headers } } : {},
				configuredMaxTokens: /* @__PURE__ */ new Map(),
				piProvider: buildRouteProvider({
					route,
					product: providerConfig.product,
					displayName: providerConfig.displayName,
					ready,
					auth: { apiKey: apiKeyOnlyAuth(providerConfig.displayName) }
				})
			});
		}
		memoKey = key;
		memoProfiles = map;
		return map;
	}
	let registration;
	let registeredFacts;
	let lastReadyHash;
	/** The current route list in fixed order. */
	function routeList() {
		return [...currentConfig.providers.keys()];
	}
	/** Registration facts: routes with their display names and retry policies. */
	function registrationFacts() {
		return JSON.stringify(routeList().map((route) => {
			const provider = currentConfig.providers.get(route);
			return {
				route,
				displayName: provider?.displayName,
				retryPolicy: provider?.retryPolicy
			};
		}));
	}
	/** Register or atomically replace this adapter's routes. */
	function ensureRegistration() {
		const routes = routeList();
		const facts = registrationFacts();
		if (registration === void 0) {
			if (routes.length === 0) {
				registeredFacts = facts;
				return;
			}
			registration = ctx.llm.registerAdapter(routes, adapter);
			registeredFacts = facts;
			return;
		}
		registration.replace(routes);
		registeredFacts = facts;
	}
	/** The directory entries for the two fixed routes. */
	function directoryEntries() {
		return routeList().map((route) => ({
			provider: route,
			displayName: currentConfig.providers.get(route)?.displayName ?? route,
			settingsNs: SETTINGS_NAMESPACE,
			settingsPath: ["providers", route],
			declared: true
		}));
	}
	let directory;
	/** Register or atomically replace the configurable-provider directory. */
	function ensureDirectory() {
		const entries = directoryEntries();
		JSON.stringify(entries);
		if (directory === void 0) {
			if (entries.length === 0) return;
			directory = ctx.llm.registerConfigurableProviders(entries);
			return;
		}
		directory.replace(entries);
	}
	/** Re-register only when the executable set actually changed. */
	function onCatalogChange(snapshot) {
		if (snapshot === void 0) return;
		const hash = readySetHash(snapshot);
		if (hash === lastReadyHash) return;
		lastReadyHash = hash;
		if (registration !== void 0) ensureRegistration();
	}
	ensureRegistration();
	ensureDirectory();
	let commandDisposers = [];
	ctx.inject(["commands"], (commandsCtx) => {
		commandDisposers = registerCommands(commandsCtx, {
			catalog,
			config: () => currentConfig,
			describeCredential: async (route) => {
				const provider = currentConfig.providers.get(route);
				if (provider === void 0) return false;
				return (await describeCredential(ctx, provider.apiKeyEnv))?.configured === true;
			}
		});
	});
	let source = () => config;
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, Config, config, {
			validate: assertServiceable,
			setSource: (next) => {
				source = next;
			},
			onChange: () => {
				try {
					const next = resolveConfig(source());
					const catalogChanged = JSON.stringify(next.catalog) !== JSON.stringify(currentConfig.catalog);
					const routesChanged = registrationFacts() !== registeredFacts;
					currentConfig = next;
					configRevision += 1;
					adapter.updateOptions({
						initialWaitMs: next.catalog.timeoutMs,
						requireFresh: next.catalog.requireFresh
					});
					if (catalogChanged) catalog.reconfigure({
						...next.catalog,
						...next.catalog.cachePath === void 0 ? {} : { cachePath: next.catalog.cachePath }
					});
					if (routesChanged) ensureRegistration();
					ensureDirectory();
				} catch (error) {
					ctx.logger.error("opencode-live: keeping the previously registered routes after a refused settings update");
					ctx.logger.error(error);
				}
			}
		});
	});
	ctx.effect(function* () {
		yield () => {
			catalog.stop();
			for (const dispose of commandDisposers) dispose();
			commandDisposers = [];
		};
	}, "opencode-live effects");
	catalog.start().catch((error) => {
		ctx.logger.warn("opencode-live: the initial catalog refresh failed; the catalog will retry periodically");
		ctx.logger.warn(error);
	});
}
/** The default cache location under the resolved DSH home. */
function defaultCachePath() {
	return dshHomePath("cache", "opencode-live", "catalog.json");
}
//#endregion
export { Config, ROUTE_BY_PRODUCT, SETTINGS_NAMESPACE, apply, inject, name };
