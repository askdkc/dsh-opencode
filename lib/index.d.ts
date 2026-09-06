import { Product, ROUTE_BY_PRODUCT, RouteId } from "./normalize.js";
import { Config } from "./config.js";
import { Context } from "@deepseek-ai/cordis";

//#region src/index.d.ts
/** Cordis plugin name. */
declare const name = "opencode-live";
/** Services required before the plugin can activate. */
declare const inject: string[];
/** The settings namespace this plugin owns. */
declare const SETTINGS_NAMESPACE = "opencode-live";
/**
 * Register the plugin against one composition context.
 * @param ctx - the Cordis context.
 * @param config - the composition base configuration for this plugin.
 */
declare function apply(ctx: Context, config?: Config): void;
//#endregion
export { Config, type Product, ROUTE_BY_PRODUCT, type RouteId, SETTINGS_NAMESPACE, apply, inject, name };