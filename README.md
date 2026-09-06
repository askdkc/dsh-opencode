# dsh-opencode — OpenCode Zen / Go live catalog plugin

An out-of-tree DSH bundle that serves the OpenCode **Zen** and **Go** products as two independent live LLM routes with a **dynamic model catalog**: models the official lists publish become selectable and executable without a plugin update, rebuild, or DSH restart, as long as they use a known wire protocol and publish the metadata the route needs.

- `opencode-zen-live` — **OpenCode Zen (Live)**
- `opencode-go-live` — **OpenCode Go (Live)**

The plugin reuses DSH's public `PiAiAdapter` and pi-ai's public `createProvider()` for all message conversion, streaming, tool calls, images, replay state, usage, cancellation, and idle-timeout behavior. It does **not** port OAuth, does not modify the existing `llm-pi-ai` configuration, does not fail over between Zen and Go automatically, and never sends an inference request as part of a catalog refresh.

## Compatibility

- DSH packages: `0.1.2-rc.1` (published release; peer range `^0.1.2-rc.1`)
- pi-ai: pinned to the installed DSH adapter's range (`>=0.84.2 <0.86`, verified on `0.84.2`)
- Cordis: `4.0.2`
- Node: `^22.19.0 || >=24.0.0`

## Installation

```sh
pnpm dsh plugin --profile web add github:askdkc/dsh-opencode
pnpm dsh --profile web --dump-config
```

The dump should contain the `opencode-live` row with both provider routes. A restart applies the bundle once; after that, catalog updates need no restart.

To remove it:

```sh
pnpm dsh plugin --profile web remove dsh-opencode
```

## API key

Both routes resolve the credential reference `apiKeyEnv` per request through the DSH credentials service (or the launch environment when no credential service is mounted). The default reference is `OPENCODE_API_KEY` for both products; set a different one per route in settings, e.g. `DSH_OPENCODE_ZEN_API_KEY` / `DSH_OPENCODE_GO_API_KEY`, and store the value through the standard credentials UI (the web Models page) or export it in the launch environment.

- A missing or unusable key fails the request with `MISSING_CREDENTIAL`; the plugin never falls back to an unrelated ambient key (`OPENAI_API_KEY`, `GEMINI_API_KEY`, …).
- Catalog fetches are unauthenticated and share no client with inference; keys never appear in URLs, logs, diagnostics, command output, or the cache.
- Go requests carry an honest `x-opencode-client: opencode-live/<version>` header and an opaque, stable `x-opencode-session` value per DSH session; the plugin never impersonates OpenCode itself.

## How the catalog works

Three public sources feed the catalog: the official Zen list, the official Go list, and the Models.dev `api.json` metadata for the `opencode` / `opencode-go` providers. The plugin joins them by exact model id and keeps every candidate visible:

| State | Meaning | Selector | Diagnostics |
|---|---|---|---|
| `ready` | officially listed with complete metadata and a known wire API | shown | — |
| `metadata-pending` | officially listed; missing name/context/output/input/api | hidden | shown with the missing fields |
| `unsupported-protocol` | metadata names an unknown SDK | hidden | shown with the SDK id |
| `catalog-only` | in Models.dev but absent from the official list | hidden | shown |
| `removed` | was officially listed before; no longer present | hidden (history keeps the name) | shown |

Wire APIs are chosen from the model-level `provider.npm` (falling back to the provider default) through a fixed allowlist: `@ai-sdk/openai-compatible` → Chat Completions, `@ai-sdk/openai` → Responses, `@ai-sdk/anthropic` → Anthropic Messages, `@ai-sdk/google` → Google Generative AI. Unknown SDK identifiers are never executed and nothing fetched is ever imported or installed. Reasoning-effort controls are offered only where the source publishes a verified effort list; toggle-only models keep the provider's default behavior.

Refreshes run single-flight per source (Models.dev once for both products) with conditional GET/304 handling, timeout and decoded-body caps, empty-list protection, and per-source failure isolation. An executable-set change re-registers the same routes in place, which publishes `llm/adapters-updated` so an open selection UI re-fetches. Snapshots are immutable and generation-bound; a prepared call cannot switch providers mid-request.

## Commands

| Command | Effect |
|---|---|
| `/opencode-refresh [all\|zen\|go]` | Force a catalog refresh (joins in-flight fetches) |
| `/opencode-status` | Freshness, per-source errors, ready/pending counts, credential presence |
| `/opencode-models <zen\|go> [--all]` | Ready models, or every candidate with its state and reason |

None of these commands displays key values or fragments, and none registers a model-visible tool.

## Configuration

Namespace `opencode-live` (composition defaults in `cordis.patch.yml`):

```yaml
providers:
  opencode-zen-live:
    product: zen            # must match the route key
    apiKeyEnv: OPENCODE_API_KEY
  opencode-go-live:
    product: go
    apiKeyEnv: OPENCODE_API_KEY
catalog:
  refreshIntervalMs: 900000   # periodic refresh (with jitter)
  listRevalidateAfterMs: 60000  # re-check TTL on display/selection
  timeoutMs: 15000            # per-request HTTP timeout
  maxStaleMs: 604800000       # 7 days; staleness display bound
  requireFresh: false         # true refuses requests while the official list is stale
```

`cachePath` (optional) relocates the validated-source cache; it defaults to `cache/opencode-live/catalog.json` under the DSH home. The cache stores source payloads and freshness facts only — never normalized output, never secrets.

`limit.output` sizes the model's capability; it is never materialized as a per-request token default. `configuredMaxTokens` stays empty by design: only explicit per-model configuration belongs there, and this plugin defines none.

## Development

```sh
pnpm install
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run (offline only; live tests skip)
pnpm test:live        # opt-in: hits the public GET endpoints, no key, no inference
pnpm build            # tsdown -> lib/
pnpm pack:check       # npm pack --dry-run
```

Tests mount a real Cordis context with the published DSH packages, stub the three catalog URLs, and cover the candidate states, refresh failure classes, wire-API selection, session headers, credential semantics, registry replacement, unload safety, and packaging.

## Scope notes

- Catalog refreshes never generate inference traffic, and a Go auth/limit error never switches the request to Zen.
- Model `limit.context` / `limit.output` come only from a validated source; unknown capacities never become fabricated numbers. Source pricing maps into pi-ai's descriptor; absent pricing is the absence of a fact, not a $0 claim.
- The repository commits the built `lib/` so installation needs no runtime TypeScript compilation.
