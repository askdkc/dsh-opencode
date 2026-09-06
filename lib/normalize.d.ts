//#region src/normalize.d.ts
/** The two OpenCode products this plugin serves. */
type Product = 'zen' | 'go';
/** DSH route keys this plugin registers; fixed for the plugin's lifetime. */
declare const ROUTE_ZEN = "opencode-zen-live";
declare const ROUTE_GO = "opencode-go-live";
type RouteId = typeof ROUTE_ZEN | typeof ROUTE_GO;
declare const ROUTE_BY_PRODUCT: Readonly<Record<Product, RouteId>>;
//#endregion
export { Product, ROUTE_BY_PRODUCT, ROUTE_GO, ROUTE_ZEN, RouteId };