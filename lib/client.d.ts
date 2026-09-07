
import { Context, Service } from "@deepseek-ai/cordis";
import { CommandResult } from "@deepseek-ai/dsh-commands/types";
import { ClientSessionContext, TokenSpan } from "@deepseek-ai/dsh-client-ui-input-trigger/client";
import { ReactNode } from "react";
import { ClientRemote, ClientRemote as ClientRemote$1 } from "@deepseek-ai/dsh-api-gateway/client";
import { SettingsNamespaceView, SettingsPathOpView } from "@deepseek-ai/dsh-settings/types";

//#region node_modules/.pnpm/@deepseek-ai+dsh-brand@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-brand/lib/types/index.d.ts
/**
 * Duplicate-install-safe nominal primitive helpers.
 *
 * A brand makes structurally identical strings or numbers non-interchangeable
 * at the type level: a `SessionId` cannot be passed where a `ToolCallId` is
 * expected, and an event sequence cannot be passed as a log offset. Comparison,
 * logging, and serialization retain the underlying primitive behavior.
 *
 * This package owns no concrete domain value and keeps no runtime identity or mutable
 * state, so independently installed copies produce interchangeable values.
 *
 * @module @deepseek-ai/dsh-brand
 */
declare const BRAND: unique symbol;
/** A string carrying a compile-time-only brand `B`. */
type Branded<B extends string> = string & {
  readonly [BRAND]: B;
};
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-session@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2_@deepseek-ai+dsh-scope@0._ee5063a80d448ae764858c08e7528ed1/node_modules/@deepseek-ai/dsh-session/lib/types/types.d.ts
/** Identifies one session in the store (and its persistence artifacts). */
type SessionId = Branded<'SessionId'>;
/**
 * Brand a string as a {@link SessionId}.
 * @param id - the raw session id string.
 * @returns the same string with the session-id brand.
 */
declare function SessionId(id: string): SessionId;
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The named Session does not exist; produced by every layer that resolves a SessionId. */
    'session/not-found': {
      readonly sessionId: SessionId;
    };
  }
} //# sourceMappingURL=types.d.ts.map
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-ui-commands@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-client-ui-commands/lib/types/client/contract.d.ts
/** Copy for an option that must be acknowledged before onSelect can run. */
interface SelectConfirmation {
  readonly title: string;
  readonly description: string;
  readonly acknowledgeLabel: string;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
}
/** One option row of a popupSelect shell. */
interface SelectOption {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly active?: boolean;
  /** Optional in-page risk gate owned by the shared popup shell. */
  readonly confirmation?: SelectConfirmation;
}
/**
 * Business registration for the popupSelect command kind. Data is
 * self-served: options/onSelect use the business package's own protocol.
 * The shell component is owned by ui-commands; business never sees it. Both
 * callbacks receive the ClientSessionContext captured at popup open.
 */
type CommandUiSpec = {
  readonly kind: 'popupSelect';
  options(session: ClientSessionContext, signal: AbortSignal): Promise<readonly SelectOption[]>;
  onSelect(option: SelectOption, session: ClientSessionContext): void | Promise<void>;
};
/**
 * One client-owned command contribution: a slash-menu entry whose behavior
 * lives entirely on the client (no host descriptor). Merged with the host
 * catalog by name — a collision with a host command fails loud at candidate
 * synthesis, never shadows.
 */
interface CommandContribution {
  /** Command name without the leading slash (unique across contributions). */
  readonly name: string;
  /** Menu row description. */
  readonly description: string;
  /** Capability filter, called with a fresh projection per candidate pass. */
  available(session: ClientSessionContext): boolean;
  /** The command's UI behavior (this phase: popupSelect only). */
  readonly ui: CommandUiSpec;
}
/**
 * A UI decoration hung on one HOST command: what its BARE invocation does on
 * this client. Not a second command — the host command keeps its catalog
 * row, its argument claim (space / argued enter), and its lifecycle logging;
 * the decoration replaces only the bare menu-pick/enter with a popup whose
 * onSelect typically submits a completed line back through command.execute.
 * A decoration never manufactures a row: a name with no host catalog entry
 * in the session's directory simply never reaches the decoration.
 */
interface CommandDecoration {
  /** The HOST command name this decorates (without the leading slash). */
  readonly name: string;
  /** Capability filter, called with a fresh projection per bare invocation. */
  available(session: ClientSessionContext): boolean;
  /** The bare-invocation UI (this phase: popupSelect only). */
  readonly ui: CommandUiSpec;
}
/** The `ctx.commandUi` service face visible to business packages. */
interface CommandUiContract {
  /**
   * Register one client command contribution; effect disposer. Duplicate
   * names throw at registration.
   */
  register(contribution: CommandContribution): () => void;
  /**
   * Hang a bare-invocation decoration on one host command; effect disposer.
   * Duplicate names throw at registration.
   */
  decorate(decoration: CommandDecoration): () => void;
  /** Resolve the per-session popup controller for one session scope (wiring/overlay layer). */
  popupFor(actx: Context): unknown;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-store@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2_@types+react@18.3.12_react@18.3.1/node_modules/@deepseek-ai/dsh-client-store/lib/types/contract.d.ts
/** Framework-neutral snapshot and store contracts. */
/** Minimal observable snapshot source shared by controllers, stores, and render adapters. */
interface ObservableSnapshot<T> {
  /** Read the cached snapshot reference. */
  getSnapshot(): T;
  /**
   * Subscribe to snapshot invalidation.
   * @param fn - invalidation callback.
   * @returns unsubscribe function.
   */
  subscribe(fn: () => void): () => void;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-store@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2_@types+react@18.3.12_react@18.3.1/node_modules/@deepseek-ai/dsh-client-store/lib/types/index.d.ts
/** Writable snapshot store (bare data face; React selector hooks are synthesized in ui-renderer). */
interface SnapshotStore<T> extends ObservableSnapshot<T> {
  /**
   * Mutate the state through an immer draft.
   * @param mutator - draft mutator.
   */
  update(mutator: (draft: T) => void): void;
  /**
   * Replace the state wholesale.
   * @param next - next state.
   */
  set(next: T): void;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-ui-commands@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-client-ui-commands/lib/types/client/popup.d.ts
/**
 * The command token segment snapshotted at shell-open time, replayed to the
 * injected {@link PopupSelectDeps.consume} callback after a successful
 * selection. The Input side guards it: a menu-path span consumes iff draftRev
 * is unchanged, an enter-path line iff the trimmed draft still equals the
 * bare token.
 */
type TokenSegment = {
  readonly via: 'menu';
  readonly span: TokenSpan;
} | {
  readonly via: 'enter';
  readonly token: string;
};
/**
 * Structural business spec the shell settles against — the popupSelect half
 * of CommandUiSpec, generic in the context value the opener captures (the
 * session wiring passes its session projection; the controller only carries
 * it from open() to the callbacks).
 */
interface PopupSpec<TCtx> {
  /** Load the option rows once per open (retry after failure reuses the same signal). */
  options(context: TCtx, signal: AbortSignal): Promise<readonly SelectOption[]>;
  /** Settle the picked option against the open-time context. */
  onSelect(option: SelectOption, context: TCtx): void | Promise<void>;
}
/** Injected session-wiring callbacks of one controller (tests pass fakes). */
interface PopupSelectDeps {
  /**
   * Consume the open-time token segment after a successful onSelect (the
   * wiring dispatches the consume-token event to the opening session).
   * @param segment - the open-time token segment snapshot.
   * @returns whether the token was consumed; false (CAS miss) is benign and
   * never retried.
   */
  consume(segment: TokenSegment): boolean;
  /** Return focus to the session composer (successful settle and Escape close paths). */
  focusComposer(): void;
}
/** Popup shell state (the shell component renders from here; closed = render null). */
interface PopupState {
  readonly open: boolean;
  /** Command name the shell is open for (null while closed). */
  readonly command: string | null;
  /** Options-load lifecycle; 'failed' keeps the shell open for retry(). */
  readonly status: 'pending' | 'ready' | 'failed';
  /** Options as loaded — never re-fetched per keystroke; views render {@link filterOptions} over them. */
  readonly options: readonly SelectOption[];
  /** Local filter text over the loaded options. */
  readonly search: string;
  /** Highlight index into the filtered row list (0 when empty/pending). */
  readonly active: number;
  /** A select() settlement is in flight: further select/search/highlight no-op until it settles. */
  readonly submitting: boolean;
  /** Option waiting for explicit risk acknowledgement; null during normal selection. */
  readonly confirming: SelectOption | null;
  /** Caller-controlled checkbox state for the pending confirmation. */
  readonly acknowledged: boolean;
  /** Surfaced settlement failure (options load or onSelect); null when none. */
  readonly error: string | null;
}
/**
 * Headless controller of one session's popupSelect shell. Late settlements
 * lose their write rights through binding identity: dismiss/dispose/reopen
 * swap the binding, so a settling options fetch or onSelect that no longer
 * matches writes nothing and consumes nothing.
 */
declare class PopupSelectController<TCtx = unknown> {
  private readonly deps;
  /** Shell state store (the overlay component subscribes here). */
  readonly state: SnapshotStore<PopupState>;
  private binding;
  /**
   * @param deps - session-wiring callbacks (token consumption + composer focus).
   */
  constructor(deps: PopupSelectDeps);
  /**
   * Open the shell for one command: publish pending state and fetch options
   * once through the business spec. A reopen supersedes the previous shell
   * (its options fetch is aborted, its late settlements are dropped).
   * @param command - command name the shell serves.
   * @param spec - the registered popupSelect spec.
   * @param context - open-time context snapshot, handed verbatim to options/onSelect.
   * @param segment - open-time token segment snapshot for post-select consumption.
   */
  open(command: string, spec: PopupSpec<TCtx>, context: TCtx, segment: TokenSegment): void;
  /** Run the one options fetch of a binding; settlement rights die with the binding. */
  private load;
  /** Re-run a failed options fetch (search survives; no-op unless status is 'failed'). */
  retry(): void;
  /**
   * Replace the local search text (pure local filter — the provider is never
   * re-queried) and rebase the highlight onto the new filtered list.
   * @param search - the shell search input's text.
   */
  setSearch(search: string): void;
  /**
   * Move the highlight across the filtered rows (wraps around; no-op unless
   * options are ready and no selection is in flight).
   * @param dir - +1 down, -1 up.
   */
  move(dir: 1 | -1): void;
  /**
   * Set the highlight directly (pointer hover; no-op unless ready, idle, and
   * in filtered range).
   * @param index - filtered-row index.
   */
  highlight(index: number): void;
  /**
   * Select one filtered row: single-flight — the first call enters
   * `submitting` and later calls no-op until it settles. Success consumes the
   * open-time token segment (a false CAS answer is benign), closes, and
   * returns focus to the composer. Failure keeps the shell open with search,
   * highlight, and token intact, surfaces the error, and re-arms select as
   * the retry.
   * @param index - filtered-row index (callers pass the highlight or the clicked row).
   * @returns settled when the attempt has closed the shell or surfaced its failure.
   */
  select(index: number): Promise<void>;
  /**
   * Update the explicit checkbox for the currently pending risk gate.
   * @param acknowledged - whether the user has acknowledged the displayed risk.
   */
  acknowledge(acknowledged: boolean): void;
  /** Cancel only the risk gate and return to the still-open option picker. */
  cancelConfirmation(): void;
  /** Settle the gated option only after the checkbox is acknowledged. */
  confirm(): Promise<void>;
  /** Run the business settlement for an already admitted option. */
  private settle;
  /**
   * Close the shell; aborts a flying options fetch and revokes settlement
   * rights. An outside pointer interaction dismisses plainly (the click's own
   * target takes focus); Escape passes focusComposer to return focus explicitly.
   * @param opts - focusComposer: also restore composer focus (Escape path).
   */
  dismiss(opts?: {
    readonly focusComposer?: boolean;
  }): void;
  /** Scope-teardown disposer: abort in-flight work and clear state (no focus side effect). */
  dispose(): void;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-ui-commands@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-client-ui-commands/lib/types/client/service.d.ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * This browser client completed one admitted Host command execution.
     * Other clients receive the durable command nodes but never this local
     * submission acknowledgment.
     * @param sessionId - Session addressed by the local submission.
     * @param name - Executed command name without the leading slash.
     * @param result - Host command result returned to this browser.
     * @mode emit
     */
    'command/executed'(sessionId: SessionId, name: string, result: CommandResult): void;
  }
}
/** Command surface: session-keyed directory + '/' source + contribution registry + per-session popups. */
declare class CommandUiRuntime extends Service implements CommandUiContract {
  static inject: string[];
  private readonly directory;
  private readonly live;
  /** `command`-namespace translator (composer refusal notices). */
  private readonly t;
  /**
   * @param ctx - owning root context (plugin fiber; the service registers
   * itself as `command` and follows that fiber's lifetime).
   */
  constructor(ctx: Context);
  /**
   * Register one client command contribution; effect disposer (rides the
   * caller's fiber). Duplicate names throw.
   * @param contribution - the contribution (descriptor + availability + popup spec).
   * @returns the disposer removing the registration.
   */
  register(contribution: CommandContribution): () => void;
  /**
   * Hang a bare-invocation decoration on one host command; effect disposer
   * (rides the caller's fiber). Duplicate names throw.
   * @param decoration - host command name + availability + popup spec.
   * @returns the disposer removing the registration.
   */
  decorate(decoration: CommandDecoration): () => void;
  /**
   * Resolve the per-session popup controller (lazy; dies with the session
   * scope). The controller's consume callback dispatches the scoped
   * consume-token event back to this session; focusComposer reaches the
   * composer through the overlay slot currency.
   * @param actx - session-scope ctx.
   * @returns the resident controller.
   */
  popupFor(actx: Context): PopupSelectController<ClientSessionContext>;
  /** Composer focus hooks by session (the overlay wiring binds the textarea focus here). */
  private readonly focusHooks;
  /**
   * Bind one session's composer-focus hook (overlay slot wiring; unbind on unmount).
   * @param id - session id.
   * @param focus - textarea focus callback.
   * @returns the unbind disposer.
   */
  bindComposerFocus(id: SessionId, focus: () => void): () => void;
  /** Menu candidates: host catalog + contribution availability, then position filtering and fuzzy name ranking. */
  private candidates;
  /** Decision table, menu column: contribution/decorated-host → popup; host input → claim; host bare → detached execute. */
  private dispatch;
  /** Decision table, space column: hot-key sync check; only host leadingInput claims. */
  private matchSpace;
  /**
   * Decision table, enter column. Strong-waits the session's catalog (a
   * warmup failure rejects — never a silent downgrade). Contributions and
   * bare host commands act on the bare token only; leadingInput claims
   * args-tolerant.
   *
   * Envelope policy: an enter submission carrying images resolves only
   * through a command declaring image acceptance. Every other command route —
   * popup, non-accepting claim, bare detached execute — throws the refusal
   * so the machine surfaces one composer notice and the draft and images
   * stay in place; nothing executes and nothing is dropped.
   */
  private matchEnter;
  /** Open the session's popup for one contribution or decoration (menu pick / bare enter). */
  private openPopup;
  /** Build the leadingInput claim: token `/name ` + the command.execute submit transaction. */
  private leadingClaim;
  /**
   * The command.execute transaction, addressed to the session's agent — pure
   * admission semantics. An unmatched line reports an error outcome (the
   * composer's immediate admission feedback); an admitted command reports
   * plain success regardless of its handler outcome, because the host
   * executor durably logged the lifecycle (`command/run`/`command/done`) and
   * the outcome renders as a persistent flow node — the composer never
   * echoes it. A handler error result reports an error outcome so the
   * composer keeps the submission (draft and images) for correction.
   * A refused call throws.
   */
  private execute;
  /** Publish the local acknowledgment without letting an observer change command admission. */
  private notifyExecuted;
  /** Log one contained `command/executed` observer failure. */
  private warnExecutedListenerFailure;
  /**
   * Fire-and-forget execute for the internal ('handled') paths. Outcomes are
   * NOT surfaced here: the host executor durably logs the command lifecycle
   * (`command/run`/`command/done`), and the mux-broadcast events render as a
   * persistent flow node on every tab. Only an admission failure — which never
   * entered a handler and therefore never logged — falls back to the composer
   * notice as immediate feedback.
   */
  private runDetached;
  /** Dispatch a consume-token event to one session (menu-pick / bare-enter execute paths). */
  private consumeVia;
  /** Route an admission failure to the session's composer notice channel (scope gone = attempt died with it). */
  private noticeFor;
  /** id → actx interchange (registered exchange point: this service coordinates for projection-only sources). */
  private scopeFor;
  private sessions;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-ui-commands@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-client-ui-commands/lib/types/client/locales.d.ts
/** `command` namespace dictionaries (the popupSelect shell's copy). */
/** Simplified Chinese dictionary (the key-set source of truth). */
declare const zh: {
  'search.placeholder': string;
  'search.aria': string;
  'status.loading': string;
  'status.applying': string;
  'status.empty': string;
  'overlay.aria': string;
  'listbox.aria': string;
  'notice.imagesUnsupported': string;
};
/** The command namespace key union. */
type CommandKey = keyof typeof zh;
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-ui-commands@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-client-ui-commands/lib/types/client/index.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    commandUi: CommandUiRuntime;
  }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The popupSelect shell's copy. */
    command: CommandKey;
  }
}
/** Required services: the '/' source registry, session scopes, commands Remote, and locale registry. */
//#endregion
//#region src/shared/opencode.d.ts
declare const ROUTES: {
  readonly zen: "opencode-zen-live";
  readonly go: "opencode-go-live";
};
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-api-remotes@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2_@deepseek-ai+dsh-scop_623cfb19ab80c91bacd7792a44182021/node_modules/@deepseek-ai/dsh-api-remotes/lib/types/remote-events.d.ts
/**
 * The one home of this application's forwarded-Host-event allowlist. Both
 * compiler faces list this file, so the Host forwarding loop and the consumer
 * `ctx.remote.$on` key face read one declaration instead of two copies that
 * could drift; `./types.ts` derives the type projection from it and stays
 * type-only.
 */
/**
 * Host events this application forwards without renaming. The explicit mode is
 * both the Host dispatch strategy and the legal key set of `ctx.remote.$on`.
 */
declare const API_REMOTE_FORWARDED_EVENTS: readonly [{
  readonly event: "agent-preset/selected";
  readonly mode: "emit";
}, {
  readonly event: "approval/request";
  readonly mode: "waterfall";
}, {
  readonly event: "api-session/activity";
  readonly mode: "emit";
}, {
  readonly event: "api-session/added";
  readonly mode: "emit";
}, {
  readonly event: "api-session/error";
  readonly mode: "emit";
}, {
  readonly event: "api-session/removed";
  readonly mode: "emit";
}, {
  readonly event: "api-session/status";
  readonly mode: "emit";
}, {
  readonly event: "commands/change";
  readonly mode: "emit";
}, {
  readonly event: "credentials/reference-updated";
  readonly mode: "emit";
}, {
  readonly event: "cordis/request-run";
  readonly mode: "emit";
}, {
  readonly event: "cordis/request-run-resolved";
  readonly mode: "emit";
}, {
  readonly event: "cordis/dynamic-package";
  readonly mode: "emit";
}, {
  readonly event: "cordis/dynamic-retract";
  readonly mode: "emit";
}, {
  readonly event: "cordis/inspect-query";
  readonly mode: "emit";
}, {
  readonly event: "cordis/inspect-query-resolved";
  readonly mode: "emit";
}, {
  readonly event: "llm/adapters-updated";
  readonly mode: "emit";
}, {
  readonly event: "settings/document-updated";
  readonly mode: "emit";
}, {
  readonly event: "user-questions/request";
  readonly mode: "waterfall";
}];
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-api-remotes@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2_@deepseek-ai+dsh-scop_623cfb19ab80c91bacd7792a44182021/node_modules/@deepseek-ai/dsh-api-remotes/lib/types/types.d.ts
/** Type projection of the allowlist; the consumer and the Host read this one. */
type ApiRemoteForwardedEvent = typeof API_REMOTE_FORWARDED_EVENTS[number]['event'];
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection extends Record<ApiRemoteForwardedEvent, true> {}
} //# sourceMappingURL=types.d.ts.map
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-typert-protocol@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-typert-protocol/lib/types/types.d.ts
declare const LOOKUP_HOST: unique symbol;
declare const LOOKUP_WIRE: unique symbol;
declare const CONTEXT_WIRE: unique symbol;
/** Type-level association between a Host object and its wire identity. */
interface TypertLookup<Host, Wire> {
  readonly [LOOKUP_HOST]: Host;
  readonly [LOOKUP_WIRE]: Wire;
}
/** Extract the Host object associated with one lookup declaration. */
type TypertLookupHost<Lookup> = Lookup extends TypertLookup<infer Host, infer _Wire> ? Host : never;
/** Extract the wire identity associated with one lookup declaration. */
type TypertLookupWire<Lookup> = Lookup extends TypertLookup<infer _Host, infer Wire> ? Wire : never;
/** Type-level association between a scoped Context kind and its wire identity. */
interface TypertContext<Wire> {
  readonly [CONTEXT_WIRE]: Wire;
}
/** Extract the wire identity associated with one scoped Context declaration. */
type TypertContextWire<ContextType> = ContextType extends TypertContext<infer Wire> ? Wire : never;
/** Merge-extensible Host object lookup declarations. */
interface TypertLookupMap {}
/** Merge-extensible scoped Context declarations. */
interface TypertContextMap {}
/** Awaitable disposer returned by Cordis-owned Typert registrations. */
type TypertDisposer = () => Promise<void>;
type StringKeyOf<Value> = Extract<keyof Value, string>;
/** Minimal runtime-schema capability carried by strict generated codecs. */
interface TypertSchema<Output = unknown> {
  /**
   * Parse and validate one boundary value.
   * @param value - untrusted boundary value.
   * @returns the validated value.
   */
  parse(value: unknown): Output;
}
/** Codec attached to one invocation parameter or result. */
type TypertCodec = {
  readonly mode: 'strict';
  readonly typeSymbol: string;
  readonly schema: TypertSchema;
} | {
  readonly mode: 'src-json';
};
/** One ordered business parameter in a Remote invocation. */
interface InvocationParameterDescriptor {
  /** Source-level parameter name. */
  readonly name: string;
  /** Required key in the wire `args` object. */
  readonly wire: string;
  /** Whether the value is JSON or requires a registered Host lookup. */
  readonly source: 'json' | 'lookup';
  /** Lookup key when `source` is `lookup`. */
  readonly lookup?: string;
  /** Boundary codec for the wire representation. */
  readonly codec: TypertCodec;
  /** Missing wire fields decode to `undefined` only for an explicitly declared `T | undefined`. */
  readonly acceptsUndefined?: true;
}
/** Source position retained for diagnostics from generated definitions. */
interface InvocationSourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}
/** Carrier-independent description of one exported method invocation. */
interface InvocationDescriptor {
  /** Globally stable generated identity. */
  readonly id: string;
  /** Cordis service key owning the method. */
  readonly service: string;
  /** Wire namespace, defaulting to the service key. */
  readonly namespace: string;
  /** Public instance method name. */
  readonly method: string;
  /** Service member invoked when the exported method name is an alias. */
  readonly implementation?: string;
  /** Absent for unary calls; stream calls validate and deliver every yielded item. */
  readonly mode?: 'stream';
  /** Receiver selection mode. */
  readonly invocation: {
    readonly kind: 'direct';
  } | {
    readonly kind: 'context';
    readonly context: string;
    readonly wire: string;
    readonly codec: TypertCodec;
  };
  /** Optional consuming-Context projection for one direct lookup parameter. */
  readonly scope?: {
    /** Context kind whose Client adapter supplies the identity. */readonly context: string; /** Lookup parameter wire field replaced by the Context identity. */
    readonly wire: string;
  };
  /** Ordered business parameters. */
  readonly parameters: readonly InvocationParameterDescriptor[];
  /** Transport cancellation injected after business parameters instead of entering wire args. */
  readonly cancellation?: {
    /** Reserved final Host method parameter. */readonly parameter: 'signal';
  };
  /** Codec for the unary result or each yielded stream item. */
  readonly result: TypertCodec;
  /** Source declaration used only for diagnostics. */
  readonly sourceLocation?: InvocationSourceLocation;
}
/** Generated Host contract selected explicitly by a Client assembly. */
interface TypertRemoteContribution {
  /** npm package that owns the Remote methods. */
  readonly package: string;
  /** Consumer-side invocation descriptors generated from that package. */
  readonly descriptors: readonly InvocationDescriptor[];
}
/**
 * Resolve one validated wire identity, synchronously or asynchronously.
 * @param id - validated wire identity.
 * @returns the Host object, or `undefined` when unavailable.
 */
type TypertLookupResolver<Host = unknown, Wire = unknown> = (id: Wire) => Host | undefined | Promise<Host | undefined>;
/** Runtime provider for one declared Host object lookup. */
interface TypertLookupProvider<Host = unknown, Wire = unknown> {
  /** Source parameter name recognized by the SRC weak parser. */
  readonly parameter: string;
  /** Wire field replacing the Host object parameter. */
  readonly wire: string;
  /** Canonical Host type symbol used by strict generation. */
  readonly hostTypeSymbol: string;
  /** Canonical wire type symbol used by strict generation. */
  readonly wireTypeSymbol: string;
  /**
   * Resolve a wire identity through the provider's default policy.
   * @param id - validated wire identity.
   * @returns the object, `undefined` when unavailable, or either asynchronously.
   */
  resolve(id: Wire): Host | undefined | Promise<Host | undefined>;
}
/** Stable wire declaration retained after a lookup provider unloads. */
interface TypertLookupDefinition {
  /** Merge-declared lookup key. */
  readonly key: string;
  /** Source parameter name recognized by the SRC weak parser. */
  readonly parameter: string;
  /** Wire field replacing the Host object parameter. */
  readonly wire: string;
  /** Canonical Host type symbol used by strict generation. */
  readonly hostTypeSymbol: string;
  /** Canonical wire type symbol used by strict generation. */
  readonly wireTypeSymbol: string;
}
/** Bidirectional projection between one environment's Context and its wire identity. */
interface TypertContextAdapter<Wire = unknown> {
  /**
   * Read the identity represented by a live Context.
   * @param ctx - Context in this adapter's environment.
   * @returns the wire identity, or `undefined` when the Context has another kind.
   */
  identity(ctx: Context): Wire | undefined;
  /**
   * Resolve a wire identity to a live Context in this adapter's environment.
   * An asynchronous Client resolver may wait for its owner to create the Context.
   * @param id - validated wire identity.
   * @returns the Context, or `undefined` when it is unavailable.
   */
  resolve(id: Wire): Context | undefined | Promise<Context | undefined>;
}
/** Host Context adapter plus the wire declaration used by strict Remote methods. */
interface TypertHostContextAdapter<Wire = unknown> extends TypertContextAdapter<Wire> {
  /** Wire field carrying the Context identity. */
  readonly wire: string;
  /** Canonical wire type symbol used by strict generation. */
  readonly wireTypeSymbol: string;
}
/** Composition-owned resolver replacing one Host Context adapter's default lookup policy. */
type TypertHostContextResolver<Wire = unknown> = (id: Wire) => Context | undefined | Promise<Context | undefined>;
/** Client-side bidirectional Context adapter. */
interface TypertClientContextAdapter<Wire = unknown> {
  /**
   * Read the identity represented by a live Client Context.
   * @param ctx - Client Context inspected by a scoped Remote caller.
   * @returns the wire identity, or `undefined` for another Context kind.
   */
  identity(ctx: Context): Wire | undefined;
  /**
   * Resolve a wire identity from the Client's currently materialized Contexts.
   * @param id - validated wire identity.
   * @returns the Client Context, or `undefined` when unavailable.
   */
  resolve(id: Wire): Context | undefined;
}
/** Host Context identity selected from the registered adapter set. */
interface TypertHostContextIdentity {
  /** Merge-declared Context kind whose adapter recognized the Context. */
  readonly kind: string;
  /** Wire identity returned by that adapter. */
  readonly identity: unknown;
}
/** Notification emitted after a Typert runtime registry changes. */
interface TypertRegistryChange {
  readonly kind: 'local' | 'remote' | 'lookup' | 'host-context' | 'client-context';
  readonly key: string;
}
/** Listener for one Typert runtime registry. */
type TypertRegistryListener = (change: TypertRegistryChange) => void;
/** Current-environment invocation definitions. */
interface TypertLocalRegistry {
  /**
   * Look up one invocation by `<namespace>/<method>`.
   * @param endpoint - canonical endpoint.
   * @returns the live descriptor, or `undefined` when absent.
   */
  get(endpoint: string): InvocationDescriptor | undefined;
  /**
   * Report whether a strict definition has existed during this Typert Service lifetime.
   * @param endpoint - canonical endpoint.
   * @returns `true` after the endpoint has been registered at least once, even if withdrawn.
   */
  hasSeen(endpoint: string): boolean;
  /** @returns a registration-order snapshot of local descriptors. */
  list(): readonly InvocationDescriptor[];
  /**
   * Observe later local-definition changes.
   * @param listener - synchronous contained observer.
   * @returns disposer for this subscription.
   */
  subscribe(listener: TypertRegistryListener): TypertDisposer;
}
/** Consumer-selected Remote contribution registry. */
interface TypertRemoteRegistry {
  /**
   * Register one generated contribution for the calling Cordis fiber.
   * @param contribution - generated Remote descriptors.
   * @returns disposer withdrawing the exact contribution.
   */
  register(contribution: TypertRemoteContribution): TypertDisposer;
  /**
   * Look up one Remote descriptor by endpoint.
   * @param endpoint - canonical endpoint.
   * @returns the descriptor, or `undefined` when unmounted.
   */
  get(endpoint: string): InvocationDescriptor | undefined;
  /** @returns a registration-order snapshot of Remote descriptors. */
  list(): readonly InvocationDescriptor[];
  /**
   * Observe later Remote contribution changes.
   * @param listener - synchronous contained observer.
   * @returns disposer for this subscription.
   */
  subscribe(listener: TypertRegistryListener): TypertDisposer;
}
/** Runtime registry for Host object lookup providers. */
interface TypertLookupRegistry {
  /**
   * Register one provider under its merge-declared key.
   * @param key - lookup key.
   * @param provider - owning package's live resolver.
   * @returns disposer withdrawing the exact provider.
   */
  register<K extends StringKeyOf<TypertLookupMap>>(key: K, provider: TypertLookupProvider<TypertLookupHost<TypertLookupMap[K]>, TypertLookupWire<TypertLookupMap[K]>>): TypertDisposer;
  /**
   * Replace one provider's default resolution policy while this contribution is active.
   * Configuration may precede provider registration; without a live provider, `get()` remains unavailable.
   * @param key - lookup key whose wire declaration remains provider-owned.
   * @param resolver - composition-owned resolver used by every lookup of this key.
   * @returns disposer restoring the provider's default resolver.
   */
  configure<K extends StringKeyOf<TypertLookupMap>>(key: K, resolver: TypertLookupResolver<TypertLookupHost<TypertLookupMap[K]>, TypertLookupWire<TypertLookupMap[K]>>): TypertDisposer;
  /**
   * Look up one provider by runtime key.
   * @param key - descriptor lookup key.
   * @returns the live provider, or `undefined` when absent.
   */
  get(key: string): TypertLookupProvider | undefined;
  /** @returns lookup declarations observed during this Typert Service lifetime. */
  definitions(): readonly TypertLookupDefinition[];
  /** @returns a snapshot of registered provider keys. */
  keys(): readonly string[];
  /**
   * Observe later lookup changes.
   * @param listener - synchronous contained observer.
   * @returns disposer for this subscription.
   */
  subscribe(listener: TypertRegistryListener): TypertDisposer;
}
/** Runtime registry for the Host and Client adapters of each Context kind. */
interface TypertContextRegistry {
  /**
   * Register a Host Context adapter.
   * @param key - merge-declared Context key.
   * @param adapter - owning package's bidirectional Host projection.
   * @returns disposer withdrawing the exact adapter.
   */
  registerHost<K extends StringKeyOf<TypertContextMap>>(key: K, adapter: TypertHostContextAdapter<TypertContextWire<TypertContextMap[K]>>): TypertDisposer;
  /**
   * Override one Host Context key's resolution policy for the calling fiber.
   * Configuration may precede provider registration and restores the provider's default resolver on disposal.
   * @param key - merge-declared Context key.
   * @param resolver - composition-owned resolver used by every Host Context lookup of this key.
   * @returns disposer restoring the provider's default resolver.
   */
  configureHost<K extends StringKeyOf<TypertContextMap>>(key: K, resolver: TypertHostContextResolver<TypertContextWire<TypertContextMap[K]>>): TypertDisposer;
  /**
   * Register a Client Context adapter.
   * @param key - merge-declared Context key.
   * @param adapter - owning package's bidirectional Client projection.
   * @returns disposer withdrawing the exact adapter.
   */
  registerClient<K extends StringKeyOf<TypertContextMap>>(key: K, adapter: TypertClientContextAdapter<TypertContextWire<TypertContextMap[K]>>): TypertDisposer;
  /**
   * Identify a live Host Context through the sole registered adapter set.
   * @param ctx - Context projected by a Host-to-Client scoped event.
   * @returns its kind and wire identity, or `undefined` when no adapter recognizes it.
   * @throws when more than one Context kind recognizes the same Context.
   */
  identifyHost(ctx: Context): TypertHostContextIdentity | undefined;
  /**
   * Look up a Host Context adapter.
   * @param key - descriptor Context key.
   * @returns the adapter, or `undefined` when absent.
   */
  getHost(key: string): TypertHostContextAdapter | undefined;
  /**
   * Look up a Client Context adapter.
   * @param key - descriptor Context key.
   * @returns the adapter, or `undefined` when absent.
   */
  getClient(key: string): TypertClientContextAdapter | undefined;
  /**
   * Observe later Context adapter changes.
   * @param listener - synchronous contained observer.
   * @returns disposer for this subscription.
   */
  subscribe(listener: TypertRegistryListener): TypertDisposer;
}
/** Minimal Typert runtime consumed through dependency inversion. */
interface TypertRegistryContract {
  readonly local: TypertLocalRegistry;
  readonly remotes: TypertRemoteRegistry;
  readonly lookups: TypertLookupRegistry;
  readonly contexts: TypertContextRegistry;
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    typert: TypertRegistryContract;
  }
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-api-remotes@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2_@deepseek-ai+dsh-scop_623cfb19ab80c91bacd7792a44182021/node_modules/@deepseek-ai/dsh-api-remotes/lib/types/client/index.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Generated Remote namespaces selected by this Client assembly. */
    remote: ClientRemote;
  }
}
/** Required service: the typed Client Remote contribution mount. */
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-ui-settings@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/contract/slots.d.ts
/**
 * Settings slot contract — the canonical home of every settings slot type,
 * owned by the settings domain base rather than by the shell that renders
 * them (ui-settings-general, which occupies `sidebar.settings`). The shell has
 * zero copy of its own: ALL text (trigger label, panel title, header actions,
 * close aria, section content) arrives from registrants. A feature owns its
 * own settings pages — adding a setting never means editing the shell; copy
 * that belongs to no single feature (chrome, the General section) is owned by
 * ui-settings-general too.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * The sidebar-foot trigger row content: icon + label, supplied as slot
     * content (the accessible name comes from the content — rail state
     * renders the label visually hidden). The shell renders the button
     * chrome and owns open state. Absent contribution degrades to an
     * icon-only button without an accessible name (broken-composition state;
     * the shipped composition always registers the seat).
     */
    'settings.trigger': {
      kind: 'single';
      scope: 'root';
      owner: SettingsTriggerOwnerProps;
    };
    /**
     * The panel title text seat. Content renders inside the nav heading row;
     * the dialog's accessible name points at that node via aria-labelledby.
     * Absent contribution leaves the heading empty.
     */
    'settings.header': {
      kind: 'single';
      scope: 'root';
      owner: SettingsHeaderOwnerProps;
    };
    /**
     * Optional actions rendered in the content-column header before Close.
     * Registrants own visibility, behavior, copy, and failure presentation;
     * the shell supplies only the ordered render site.
     */
    'settings.action': {
      kind: 'list';
      scope: 'root';
      owner: SettingsHeaderOwnerProps;
    };
    /**
     * The close button's visually-hidden label text (the button itself —
     * icon, geometry, focus — is shell chrome). Absent contribution leaves
     * the button without an accessible name (broken-composition state).
     */
    'settings.close': {
      kind: 'single';
      scope: 'root';
      owner: SettingsHeaderOwnerProps;
    };
    /**
     * One settings page per list entry. Registrant options carry the nav
     * identity: `id` (section key, drives `only` filtering), `order` (nav
     * position), `label` (registrant-localized display text — the registrant
     * re-registers with fresh text on locale change, so the shell never
     * subscribes locale state; the ledger bump doubles as the shell's
     * re-render trigger). Sections render inside the panel content column.
     * (`settings.general.item`, declared by ui-settings-general's General
     * entry, is typed in the locale package — the common dependency of every
     * item registrant; the shell neither declares nor renders it.)
     */
    'settings.section': {
      kind: 'list';
      scope: 'root';
      owner: SettingsSectionOwnerProps;
    };
    /**
     * One page inside the Plugins settings section. The section owner renders
     * localized entry labels as tabs and mounts each contribution inside its
     * corresponding tab panel. Options: `id` (tab key), `order` (tab order),
     * and `label` (registrant-localized tab text). Declared at runtime by the
     * feature that owns the Plugins section; the type lives here so inventory
     * and configuration plugins collaborate without depending on one another.
     */
    'settings.plugins.tab': {
      kind: 'list';
      scope: 'root';
      owner: SettingsPluginsTabOwnerProps;
    };
    /**
     * Root-scoped onboarding steps contributed by settings features. The
     * shell mounts one ordered step at a time; the active registrant either
     * completes itself or keeps ownership until the user completes its sole
     * path. Registrants own readiness, copy, dialog behavior, AND visible
     * chrome: a step wraps its visible content in its modal surface (including
     * `#root` inert ownership) and renders null while private facts are still
     * loading. The shell paints no chrome of its own, so a mounted-but-deciding
     * step shows and blocks nothing.
     */
    'settings.onboarding': {
      kind: 'list';
      scope: 'root';
      owner: SettingsOnboardingOwnerProps;
    };
    /**
     * One preference row inside the General section — the additive seat for a
     * single setting that needs no page of its own (a whole page is
     * `settings.section`), contributed by the feature plugin that owns the
     * preference (locale → Language, ui-theme → Appearance, ui-conversation →
     * Composer Enter). Options: `id` (row key), `order` (row position). The
     * section column only stacks rows, so a row draws its own internals,
     * including its label: nothing projects a `label` here and the owner passes
     * no props at all — copy, current value, and the write path are all yours,
     * through your own inject face and `host.call`. Declared at runtime by
     * ui-settings-general's General entry; the type lives here with every other
     * settings slot type, because this package is the settings domain's base
     * layer and every registrant already depends on it for `ctx.settingsScope`.
     */
    'settings.general.item': {
      kind: 'list';
      scope: 'root';
      owner: SettingsGeneralItemOwnerProps;
    };
  }
}
/** Owner share of a General preference row (the section supplies nothing). */
interface SettingsGeneralItemOwnerProps {
  /** Marker field: item owner props are intentionally empty. */
  children?: never;
}
/** Owner share of a Plugins tab (the section supplies nothing). */
interface SettingsPluginsTabOwnerProps {
  /** Marker field: tab owner props are intentionally empty. */
  children?: never;
}
/** Owner share of the trigger content seat: the sidebar column state. */
interface SettingsTriggerOwnerProps {
  /** Whether the sidebar renders wide content (false = 56px rail, icon only). */
  wide: boolean;
}
/** Owner share of the header title seat (the shell supplies nothing). */
interface SettingsHeaderOwnerProps {
  /** Marker field: header owner props are intentionally empty. */
  children?: never;
}
/**
 * Owner share of a settings section entry. The shell owns modal visibility
 * and navigation; a section's data arrives through its own inject faces and
 * stores. `close` is the one shell affordance a section receives, for flows
 * that leave settings altogether (starting a session from a section) — the
 * onboarding coordinator's `openSection`/`complete` precedent, inverted.
 */
interface SettingsSectionOwnerProps {
  /** Close the settings panel (the shell owns the open state). */
  close: () => void;
}
/** Owner share of the currently active settings-backed onboarding step. */
interface SettingsOnboardingOwnerProps {
  /** Stable id of the step currently selected by the coordinator. */
  stepId: string;
  /** Complete or skip this step and transfer ownership to the next entry. */
  complete: () => void;
  /** Open the settings panel directly on one registered section. */
  openSection: (id: string) => void;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.3/node_modules/@deepseek-ai/cosmokit/lib/types/types.d.ts
declare function isArrayBufferLike(value: any): value is ArrayBufferLike;
declare function isArrayBufferSource(value: any): value is Binary.Source;
/** Binary source detection and base64/hex conversion helpers. */
declare namespace Binary {
  type Source<T extends ArrayBufferLike = ArrayBufferLike> = T | ArrayBufferView<T>;
  const is: typeof isArrayBufferLike;
  const isSource: typeof isArrayBufferSource;
  function fromSource<T extends ArrayBufferLike>(source: Source<T>): T;
  function toBase64(source: Source): string;
  function fromBase64(source: string): ArrayBuffer | Uint8Array<ArrayBuffer>;
  function toHex(source: Source): string;
  function fromHex(source: string): ArrayBuffer;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.3/node_modules/@deepseek-ai/cosmokit/lib/types/misc.d.ts
/** String/symbol keyed dictionary type. */
type Dict<T = any, K extends string | symbol = string> = { [key in K]: T };
//#endregion
//#region node_modules/.pnpm/@standard-schema+spec@1.1.0/node_modules/@standard-schema/spec/dist/index.d.ts
/** The Standard Typed interface. This is a base type extended by other specs. */
interface StandardTypedV1<Input = unknown, Output = Input> {
  /** The Standard properties. */
  readonly "~standard": StandardTypedV1.Props<Input, Output>;
}
declare namespace StandardTypedV1 {
  /** The Standard Typed properties interface. */
  interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined;
  }
  /** The Standard Typed types interface. */
  interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input;
    /** The output type of the schema. */
    readonly output: Output;
  }
  /** Infers the input type of a Standard Typed. */
  type InferInput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["input"];
  /** Infers the output type of a Standard Typed. */
  type InferOutput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}
/** The Standard Schema interface. */
interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}
declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  interface Props<Input = unknown, Output = Input> extends StandardTypedV1.Props<Input, Output> {
    /** Validates unknown input values. */
    readonly validate: (value: unknown, options?: StandardSchemaV1.Options | undefined) => Result<Output> | Promise<Result<Output>>;
  }
  /** The result interface of the validate function. */
  type Result<Output> = SuccessResult<Output> | FailureResult;
  /** The result interface if validation succeeds. */
  interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output;
    /** A falsy value for `issues` indicates success. */
    readonly issues?: undefined;
  }
  interface Options {
    /** Explicit support for additional vendor-specific parameters, if needed. */
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }
  /** The result interface if validation fails. */
  interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: ReadonlyArray<Issue>;
  }
  /** The issue interface of the failure output. */
  interface Issue {
    /** The error message of the issue. */
    readonly message: string;
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  /** The path segment interface of the issue. */
  interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey;
  }
  /** The Standard types interface. */
  interface Types<Input = unknown, Output = Input> extends StandardTypedV1.Types<Input, Output> {}
  /** Infers the input type of a Standard. */
  type InferInput<Schema extends StandardTypedV1> = StandardTypedV1.InferInput<Schema>;
  /** Infers the output type of a Standard. */
  type InferOutput<Schema extends StandardTypedV1> = StandardTypedV1.InferOutput<Schema>;
}
/** The Standard JSON Schema interface. */
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+schemastery@3.18.2/node_modules/@deepseek-ai/schemastery/lib/types/index.d.ts
declare const kSchema: unique symbol;
declare global {
  namespace Schemastery {
    /** Convert primitive constructors, constants, and existing schemas into a schema type. */
    type From<X> = X extends string | number | boolean ? Schema<X> : X extends Schema ? X : X extends typeof String ? Schema<string> : X extends typeof Number ? Schema<number> : X extends typeof Boolean ? Schema<boolean> : X extends typeof Function ? Schema<Function, (...args: any[]) => any> : X extends Constructor<infer S> ? Schema<S> : never;
    type TypeS1<X> = X extends Schema<infer S, unknown> ? S : never;
    type Inverse<X> = X extends Schema<any, infer Y> ? (arg: Y) => void : never;
    /** Input type accepted by a schema-like value. */
    type TypeS<X> = TypeS1<From<X>>;
    /** Output type returned by a schema-like value after validation. */
    type TypeT<X> = ReturnType<From<X>>;
    /** Resolver callback used by custom schema types registered with `Schema.extend()`. */
    type Resolve = (data: any, schema: Schema, options: Options, strict?: boolean) => [any, any?];
    /** Input type accepted by one schema in an intersection. */
    type IntersectS<X> = From<X> extends Schema<infer S, unknown> ? S : never;
    /** Output type returned by one schema in an intersection. */
    type IntersectT<X> = Inverse<From<X>> extends ((arg: infer T) => void) ? T : never;
    type TupleS<X extends readonly any[]> = X extends readonly [infer L, ...infer R] ? [TypeS<L>?, ...TupleS<R>] : any[];
    type TupleT<X extends readonly any[]> = X extends readonly [infer L, ...infer R] ? [TypeT<L>?, ...TupleT<R>] : any[];
    type ObjectS<X extends Dict> = { [K in keyof X]?: TypeS<X[K]> | null } & Dict;
    type ObjectT<X extends Dict> = { [K in keyof X]: TypeT<X[K]> } & Dict;
    type Constructor<T = any> = new (...args: any[]) => T;
    /** Static constructor and factory methods exposed by the default `Schema` export. */
    interface Static {
      <T = any>(options: Partial<Schema<T>>): Schema<T>;
      new <T = any>(options: Partial<Schema<T>>): Schema<T>;
      prototype: Schema;
      /** Validate a value against a schema node and return `[output, adaptedInput?]`. */
      resolve: Resolve;
      /** Infer a schema from a primitive value, constructor, or existing schema. */
      from<X = any>(source?: X): From<X>;
      /** Register a resolver for a custom schema `type`. */
      extend(type: string, resolve: Resolve): void;
      /** Accept any value without validation. */
      any<T = any>(): Schema<T>;
      /** Accept only nullable input. */
      never(): Schema<never>;
      /** Accept exactly one constant value. */
      const<const T>(value: T): Schema<T>;
      /** Accept strings, with optional metadata constraints added by instance methods. */
      string(): Schema<string>;
      /** Accept numbers, with optional range and step constraints. */
      number(): Schema<number>;
      /** Accept non-negative integer numbers. */
      natural(): Schema<number>;
      /** Accept a number between 0 and 1 and mark it as a slider. */
      percent(): Schema<number>;
      /** Accept booleans. */
      boolean(): Schema<boolean>;
      /** Accept `Date` instances or parse datetime strings into `Date` objects. */
      date(): Schema<string | Date, Date>;
      /** Accept `RegExp` instances or parse strings into regular expressions. */
      regExp(flag?: string): Schema<string | RegExp, RegExp>;
      /** Accept binary sources and normalize them to `ArrayBufferLike`. */
      arrayBuffer(): Schema<Binary.Source, ArrayBufferLike>;
      arrayBuffer(encoding: 'hex' | 'base64'): Schema<Binary.Source | string, ArrayBufferLike>;
      /** Accept a numeric bitset or string keys and normalize to a number. */
      bitset<K extends string>(bits: Partial<Record<K, number>>): Schema<number | readonly K[], number>;
      /** Accept functions. */
      function(): Schema<Function, (...args: any[]) => any>;
      /** Accept instances of a constructor or objects whose constructor name matches. */
      is(constructor: string): Schema;
      is<T>(constructor: Constructor<T>): Schema<T>;
      /** Accept arrays whose elements match `inner`. */
      array<X>(inner: X): Schema<TypeS<X>[], TypeT<X>[]>;
      /** Accept plain objects with values matching `inner` and optional key schema. */
      dict<X, Y extends Schema<any, string> = Schema<string>>(inner: X, sKey?: Y): Schema<Dict<TypeS<X>, TypeS<Y>>, Dict<TypeT<X>, TypeT<Y>>>;
      /** Accept tuple arrays where each index matches the corresponding schema. */
      tuple<const X extends readonly any[]>(list: X): Schema<TupleS<X>, TupleT<X>>;
      /** Accept plain objects whose declared properties match the schema dictionary. */
      object<X extends Dict>(dict: X): Schema<ObjectS<X>, ObjectT<X>>;
      /** Accept values matching at least one schema in `list`. */
      union<const X>(list: readonly X[]): Schema<TypeS<X>, TypeT<X>>;
      /** Accept values matching every schema in `list`, merging object outputs. */
      intersect<const X>(list: readonly X[]): Schema<IntersectS<X>, IntersectT<X>>;
      /** Validate with `inner`, then convert the result with `callback`. */
      transform<X, T>(inner: X, callback: (value: TypeS<X>, options: Schemastery.Options) => T, preserve?: boolean): Schema<TypeS<X>, T>;
      /** Defer construction of a recursive schema until validation or serialization. */
      lazy<X extends Schema>(callback: () => X): X;
      ValidationError: typeof ValidationError;
    }
    /** Runtime validation options shared by all schema calls. */
    interface Options {
      /** Remove invalid object properties instead of throwing when possible. */
      autofix?: boolean;
      /** Skip validation for selected values and schema nodes. */
      ignore?(data: any, schema: Schema): boolean;
      /** Path used to format nested validation errors. */
      path?: (keyof any)[];
    }
    /** UI and validation metadata attached by schema builder methods. */
    interface Meta<T = any> {
      default?: T extends {} ? Partial<T> : T;
      required?: boolean;
      disabled?: boolean;
      collapse?: boolean;
      badges?: {
        text: string;
        type: string;
      }[];
      hidden?: boolean;
      loose?: boolean;
      role?: string;
      extra?: any;
      link?: string;
      description?: string | Dict<string>;
      comment?: string;
      pattern?: {
        source: string;
        flags?: string;
      };
      max?: number;
      min?: number;
      step?: number;
    }
  }
  /** Callable schema instance that validates input and returns normalized output. */
  interface Schemastery<S = any, T = S> {
    (data?: S | null, options?: Schemastery.Options): T;
    new (data?: S | null, options?: Schemastery.Options): T;
    [kSchema]: true;
    uid: number;
    meta: Schemastery.Meta<T>;
    type: string;
    sKey?: Schema;
    inner?: Schema;
    list?: Schema[];
    dict?: Dict<Schema>;
    bits?: Dict<number>;
    callback?: Function;
    constructor?: string | Function;
    builder?: Function;
    value?: T;
    refs?: Dict<Schema>;
    preserve?: boolean;
    '~standard': StandardSchemaV1.Props;
    /** Format this schema as a compact TypeScript-like type string. */
    toString(inline?: boolean): string;
    /** Serialize this schema, preserving shared and recursive references. */
    toJSON(): Schema<S, T>;
    /** Mark nullable input as invalid unless a default supplies a fallback. */
    required(value?: boolean): Schema<S, T>;
    /** Hide this schema node from UI renderers. */
    hidden(value?: boolean): Schema<S, T>;
    /** Return the default value instead of throwing when validation fails. */
    loose(value?: boolean): Schema<S, T>;
    /** Attach a renderer role and optional role-specific metadata. */
    role(text: string, extra?: any): Schema<S, T>;
    /** Attach an external documentation link. */
    link(link: string): Schema<S, T>;
    /** Set the fallback value used for nullable input. */
    default(value: T): Schema<S, T>;
    /** Attach an auxiliary comment for documentation or form UIs. */
    comment(text: string): Schema<S, T>;
    /** Attach a localized or plain description for documentation or form UIs. */
    description(text: string): Schema<S, T>;
    /** Mark this schema node as disabled for form UIs. */
    disabled(value?: boolean): Schema<S, T>;
    /** Request collapsed rendering for nested form UIs. */
    collapse(value?: boolean): Schema<S, T>;
    /** Add a deprecated badge to this schema node. */
    deprecated(): Schema<S, T>;
    /** Add an experimental badge to this schema node. */
    experimental(): Schema<S, T>;
    /** Require strings to match a regular expression. */
    pattern(regexp: RegExp): Schema<S, T>;
    /** Set an inclusive maximum for numbers or collection lengths. */
    max(value: number): Schema<S, T>;
    /** Set an inclusive minimum for numbers or collection lengths. */
    min(value: number): Schema<S, T>;
    /** Set the numeric increment constraint. */
    step(value: number): Schema<S, T>;
    /** Add or replace an object property schema. */
    set(key: string, value: Schema): Schema<S, T>;
    /** Append a tuple, union, or intersection member schema. */
    push(value: Schema): Schema<S, T>;
    /** Remove values equal to schema defaults from normalized output. */
    simplify(value?: any): any;
    /** Return a schema clone with descriptions merged from locale messages. */
    i18n(messages: Dict): Schema<S, T>;
    /** Attach arbitrary metadata consumed by form renderers and downstream tools. */
    extra<K extends keyof Schemastery.Meta>(key: K, value: Schemastery.Meta[K]): Schema<S, T>;
  }
}
declare class ValidationError extends TypeError {
  options: Schemastery.Options;
  name: string;
  constructor(message: string, options: Schemastery.Options);
  static is(error: any): error is ValidationError;
}
type Schema<S = any, T = S> = Schemastery<S, T>;
declare const Schema: Schemastery.Static;
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-ui-settings@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/schema.d.ts
/** Live schemastery node used for settings introspection and validation. */
type SchemaNode = Schema;
/**
 * Settings-owned synchronous schema service. Dynamic client plugins receive
 * this Cordis entity instead of importing executable helpers from one another.
 */
declare class SettingsSchemaService extends Service {
  /** @param ctx - providing ui-settings context. */
  constructor(ctx: Context);
  /**
   * Rehydrate one serialized `schema.toJSON()` envelope.
   * @param serialized - serialized Schemastery node.
   * @returns live schema node.
   */
  rehydrate(serialized: unknown): SchemaNode;
  /**
   * Validate a settings draft.
   * @param schema - live schema node.
   * @param draft - candidate settings value.
   * @returns validation failure text, or `undefined` when valid.
   */
  validate(schema: SchemaNode, draft: unknown): string | undefined;
  /**
   * Resolve an object, dict, or array schema node at a settings path.
   * @param root - schema node to traverse.
   * @param path - object keys or array indexes.
   * @returns the resolved node, or `undefined` when the path is absent.
   */
  nodeAtPath(root: SchemaNode, path: readonly string[]): SchemaNode | undefined;
  /**
   * Read a nested value by a string-key or array-index path.
   * @param value - value to traverse.
   * @param path - object keys or array indexes.
   * @returns the resolved value, or `undefined` when the path is absent.
   */
  getPath(value: unknown, path: readonly string[]): unknown;
  /**
   * Report whether the final path key exists independently of its value.
   * @param value - value to traverse.
   * @param path - object keys or array indexes.
   * @returns whether the path exists.
   */
  hasPath(value: unknown, path: readonly string[]): boolean;
  /**
   * Immutably set a nested value, materializing missing containers.
   * @param root - settings object to copy.
   * @param path - non-empty object-key or array-index path.
   * @param value - replacement value.
   * @returns copied root containing the replacement.
   * @throws when `path` is empty.
   */
  setPath(root: Record<string, unknown>, path: readonly string[], value: unknown): Record<string, unknown>;
  /**
   * Immutably remove a nested key, preserving an unchanged missing root.
   * @param root - settings object to copy.
   * @param path - non-empty object-key or array-index path.
   * @returns copied root without the key, or `root` when the path is absent.
   * @throws when `path` is empty.
   */
  deletePath(root: Record<string, unknown>, path: readonly string[]): Record<string, unknown>;
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Settings-owned synchronous schema and immutable path operations. */
    settingsSchema: SettingsSchemaService;
  }
} //# sourceMappingURL=schema.d.ts.map
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-ui-settings@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/settings-contract.d.ts
/** Client-side sync state of one settings namespace. */
interface SettingsScopeSnapshot<T> {
  /**
   * `loading` until the first accepted section, `ready` while one stands, and
   * `unavailable` when the namespace is not exposed to this client or the
   * connection keeps preferences process-local (memory mode).
   */
  status: 'loading' | 'ready' | 'unavailable';
  /** Last accepted schema-resolved section; undefined before the first acceptance. */
  value: T | undefined;
  /**
   * Composition layer the Host resolved {@link value} over, when the owning
   * plugin declared one. What a field reverts to once cleared.
   */
  base: unknown;
  /**
   * Raw user layer as stored, when one exists. A field's PRESENCE here is what
   * marks it overridden — an override whose value equals the composition
   * default is still an override, and comparing values could not see it.
   */
  user: unknown;
  /** Namespace revision fencing the next write; undefined before the first Host view. */
  revision: number | undefined;
  /** Whether the Host document accepts writes; memory mode never does. */
  writable: boolean;
  /** `host` syncs with the Host document; `memory` keeps a remote browser process-local. */
  mode: 'host' | 'memory';
}
/** Domain-owned description of one settings namespace consumed by a browser plugin. */
interface SettingsScopeSpec<T> {
  /** Settings namespace registered by the owning Host plugin. */
  namespace: string;
  /**
   * Narrow one wire section; undefined keeps the last accepted value. The
   * default validates the section against the namespace's own serialized wire
   * schema, so domains add a decoder only to narrow beyond that schema.
   */
  decode?: (section: unknown) => T | undefined;
}
/**
 * Reactive owner handle over one namespace's durable section — the browser
 * mirror of the Host-side `SettingsScope` owner seam. Domain services read
 * and observe the snapshot and route explicit user choices through its
 * mutation methods.
 */
interface SettingsScope<T> {
  /** @returns the current sync snapshot (stable reference until the next change). */
  getSnapshot(): SettingsScopeSnapshot<T>;
  /**
   * Observe snapshot replacements.
   * @param listener - invoked after each snapshot change.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Queue one atomic namespace mutation. All operations share one revision
   * fence, Host validation, persistence decision, and recovery read. Supplying
   * `expectedRevision` preserves an earlier read as the fence instead of using
   * the latest queued or mirrored revision.
   * @param ops - ordered field operations copied when queued.
   * @param expectedRevision - optional fixed revision read by the domain editor.
   * @returns settlement after the mutation and any latest-write recovery read.
   */
  mutate(ops: readonly SettingsPathOpView[], expectedRevision?: number): Promise<void>;
  /**
   * Queue one field write. Rapid writes preserve mutation order, each carries
   * the latest known namespace revision, and only the latest settlement may
   * publish; a rejected or failed latest write reloads Host state instead.
   * @param field - scalar field inside the namespace section.
   * @param value - JSON-shaped value selected by the user.
   * @returns settlement after the write and any latest-write recovery read.
   */
  set(field: string, value: unknown): Promise<void>;
  /**
   * Queue one field clear, so the field re-inherits the composition layer.
   * Shares {@link set}'s ordering, revision, and recovery contract.
   * @param field - scalar field inside the namespace section.
   * @returns settlement after the clear and any latest-write recovery read.
   */
  unset(field: string): Promise<void>;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-ui-settings@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/settings-mirror.d.ts
/** The full `settings.describe` answer the mirror serves. */
interface SettingsDescribeView {
  /** Every namespace a live Host plugin registered, as the Host reported it. */
  namespaces: readonly SettingsNamespaceView[];
  /** Whether the settings provider accepts writes. */
  writable: boolean;
  /** Whether a native settings document exists for the Host to open. */
  hasDocument: boolean;
}
/** Mirror state every derived settings surface renders from. */
interface SettingsMirrorSnapshot {
  /**
   * `unavailable` is the terminal non-loopback state; `ready` persists across
   * later failed refreshes (the held view keeps serving); `idle` means no
   * answer is held and no read is running, so `ensure` will start one.
   */
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  /** The last good answer; undefined until the first success. */
  view: SettingsDescribeView | undefined;
  /** The latest refresh failure message, cleared by the next success. */
  error: string | null;
}
/**
 * The mirror as cross-namespace surfaces consume it: current answer,
 * subscription, first-use read, and the write-answer fold. `load` stays off
 * this face — invalidation refreshes belong to the mirror's owning plugin.
 */
interface SettingsDescribeFace {
  /** @returns the current sync snapshot (stable reference until the next change). */
  getSnapshot(): SettingsMirrorSnapshot;
  /**
   * Observe snapshot replacements.
   * @param listener - invoked after each snapshot change.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Resolve once an answer is held (or the mirror is terminally unavailable),
   * reading only from `idle`.
   * @returns settlement of the current or newly started read, if any.
   */
  ensure(): Promise<void>;
  /**
   * Fold one write answer's namespace view into the held view without a wire
   * read, invalidating any older read still in flight.
   * @param view - the namespace view a settings write answered with.
   */
  acceptView(view: SettingsNamespaceView): void;
}
/**
 * Serializes every Host `settings.describe` read behind one snapshot store.
 * Concurrent {@link load} calls fold into the in-flight read plus one rerun,
 * so an invalidation arriving mid-read is never lost and never duplicated.
 */
declare class SettingsDescribeMirror implements SettingsDescribeFace {
  private readonly ctx;
  private readonly persistence;
  private readonly store;
  private inFlight;
  private rerun;
  private generation;
  /**
   * @param ctx - the providing plugin's context, whose `remote.settings`
   * namespace answers the describe read.
   * @param persistence - client-selected Host persistence; non-loopback pages may remain process-local.
   */
  constructor(ctx: Context, persistence?: 'host' | 'memory');
  /** @returns the current sync snapshot (stable reference until the next change). */
  getSnapshot(): SettingsMirrorSnapshot;
  /**
   * Observe snapshot replacements.
   * @param listener - invoked after each snapshot change.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Refresh from the Host. A call during an in-flight read marks one rerun
   * after it settles instead of racing a second wire read.
   * @returns settlement after this call's freshness is reflected.
   */
  load(): Promise<void>;
  /**
   * Resolve once an answer is held (or the mirror is terminally unavailable),
   * reading only from `idle`. The cheap idempotent entry for surfaces that
   * render on first use.
   * @returns settlement of the current or newly started read, if any.
   */
  ensure(): Promise<void>;
  /**
   * Fold one write answer's namespace view into the held view without a wire
   * read, and invalidate any read still in flight. With no held document, the
   * answer is not published as a partial document; an in-flight read reruns so
   * it cannot publish a document fetched before the write committed.
   * @param view - the namespace view a settings write answered with.
   */
  acceptView(view: SettingsNamespaceView): void;
  /**
   * Convenience row lookup on the held view.
   * @param ns - namespace identity.
   * @returns the namespace view, or undefined while unanswered or unregistered.
   */
  namespace(ns: string): SettingsNamespaceView | undefined;
  private run;
  private shouldRerun;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-client-ui-settings@0.1.2-rc.1_@deepseek-ai+cordis@4.0.2/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/settings-scope.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    settingsScope: SettingsScopeBinder;
  }
}
/**
 * The settings domain's base service. Features that own a preference reach the
 * settings transport through this service rather than a shared function: the
 * client bundle purity gate forbids cross-plugin value imports and directs
 * cross-plugin collaboration through cordis services
 * (`packages/client/tsdown.client.ts`).
 */
declare class SettingsScopeBinder extends Service {
  private readonly mirror;
  private readonly schema;
  private readonly persistence;
  /**
   * The PROVIDING fiber, kept because a Service reads `ctx` as its *consumer's*
   * fiber: letting a bound scope write through the caller's context would make
   * every caller declare `remote.settings` in its own `inject`.
   */
  private readonly owner;
  /**
   * @param ctx - the providing plugin's context.
   * @param config - the shared describe mirror every bound scope derives from,
   * the settings-owned schema operations, and the Host persistence the provider
   * resolved from `remote.$host`.
   */
  constructor(ctx: Context, config: {
    mirror: SettingsDescribeMirror;
    schema: SettingsSchemaService;
    persistence: 'host' | 'memory';
  });
  /**
   * The shared mirror's read/fold face for cross-namespace surfaces (schema
   * introspection, the served-namespace directory). Per-namespace consumers
   * use {@link bind}; both derive from the same snapshot, so they can never
   * disagree about the document.
   * @returns the describe face over the shared mirror.
   */
  describe(): SettingsDescribeFace;
  /**
   * Bind one namespace scope on the CALLER's plugin lifecycle — the service
   * proxy binds `this.ctx` to the caller at call time, so the scope's disposer
   * belongs to the calling fiber. The scope derives from the shared mirror
   * (whose invalidation subscriptions live with the providing plugin), so
   * binding adds no wire read of its own and activation never blocks on the
   * settings transport.
   * @param spec - domain-owned namespace contract.
   * @returns the bound scope consumed by the domain's services and rows.
   */
  bind<T>(spec: SettingsScopeSpec<T>): SettingsScope<T>;
}
//#endregion
//#region src/client/types.d.ts
type ClientContext = Context & {
  readonly commandUi: CommandUiContract;
  readonly remote: ClientRemote$1;
  readonly settingsScope: {
    describe(): SettingsDescribeFace;
  };
  readonly slots: {
    inject(name: string, factory: () => unknown): () => void;
    register(definition: Record<string, unknown>, component: (props: any) => ReactNode): () => void;
  };
};
interface ProviderOwnerProps {
  provider: {
    provider: string;
    settingsPath?: readonly string[];
  };
  configured: boolean;
  keyConfigured: boolean;
}
//#endregion
//#region src/client/credential-controller.d.ts
type Route = keyof typeof ROUTES;
type RouteCredentialState = {
  kind: 'loading';
  route: Route;
} | {
  kind: 'unavailable';
  route: Route;
  reason: string;
} | {
  kind: 'known';
  route: Route;
  ref: string;
  configured: boolean;
  writable: boolean;
  source?: string;
  sharedWith: readonly Route[];
};
interface SaveResult {
  kind: 'saved' | 'saved-unconfirmed' | 'error';
  message: string;
}
declare class CredentialController {
  private readonly ctx;
  private readonly inFlight;
  private readonly states;
  private readonly generations;
  private readonly subscriptions;
  private disposed;
  private disposalGeneration;
  constructor(ctx: ClientContext);
  dispose(): void;
  subscribe(listener: () => void): () => void;
  private readonly listeners;
  private invalidate;
  private currentSettings;
  private refFor;
  loadRoute(route: Route, signal?: AbortSignal): Promise<RouteCredentialState>;
  private commit;
  loadRoutes(signal?: AbortSignal): Promise<Record<Route, RouteCredentialState>>;
  state(route: Route): RouteCredentialState | undefined;
  save(route: Route, value: string, displayedRef: string): Promise<SaveResult>;
}
//#endregion
//#region src/client/setup-controller.d.ts
type SetupRoute = Route | 'status';
interface SetupState {
  open: boolean;
  route?: SetupRoute;
  message?: string;
}
declare class SetupController {
  private readonly ctx;
  readonly credentials: CredentialController;
  private current;
  private readonly listeners;
  constructor(ctx: ClientContext);
  getSnapshot: () => SetupState;
  subscribe: (listener: () => void) => (() => void);
  dispose(): void;
  private update;
  open(route: SetupRoute, message?: string): void;
  close(): void;
  private sessionId;
  select(option: SelectOption, sessionId?: unknown): Promise<void>;
  state(route: Route): RouteCredentialState | undefined;
}
//#endregion
//#region src/client/index.d.ts
/** Client packages required by this entry's injected services and UI modules. */
declare const inject: readonly ["@deepseek-ai/dsh-api-remotes", "@deepseek-ai/dsh-commands", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-store", "@deepseek-ai/dsh-client-ui-commands", "@deepseek-ai/dsh-client-ui-layout", "@deepseek-ai/dsh-client-ui-primitives", "@deepseek-ai/dsh-client-ui-renderer", "@deepseek-ai/dsh-client-ui-settings", "@deepseek-ai/dsh-client-ui-settings-models", "@deepseek-ai/dsh-client-ui-slots"];
declare function apply(ctx: ClientContext): void;
//#endregion
export { type ClientContext, type ProviderOwnerProps, SetupController, apply, inject };
