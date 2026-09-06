import { Product } from "./normalize.js";
import { RetryPolicyConfig } from "@deepseek-ai/dsh-llm";
import z from "@deepseek-ai/schemastery";
//#region src/config.d.ts
/** Configuration for one fixed live route; the `providers` dict key IS the route. */
interface OpenCodeProviderConfig {
  /** Which OpenCode product this route serves; must match the route key. */
  product?: Product;
  /** Credential reference (environment-variable name) resolved per request. */
  apiKeyEnv?: string;
  /** Display name shown by configuration surfaces. */
  displayName?: string;
  /** Additional deployment-owned request headers. */
  headers?: Record<string, string>;
  /** Provider-owned model-request retry policy. */
  retryPolicy?: RetryPolicyConfig;
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs?: number;
}
/** Catalog refresh configuration. */
interface CatalogConfigInput {
  refreshIntervalMs?: number;
  listRevalidateAfterMs?: number;
  timeoutMs?: number;
  maxStaleMs?: number;
  requireFresh?: boolean;
  /** Cache file location; defaults under the DSH home. */
  cachePath?: string;
}
/** Plugin configuration. */
interface Config {
  providers?: Record<string, OpenCodeProviderConfig>;
  catalog?: CatalogConfigInput;
}
/** Runtime schema for {@link Config}. */
declare const Config: z<Config>;
//#endregion
export { CatalogConfigInput, Config, OpenCodeProviderConfig };