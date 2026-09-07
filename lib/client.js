window.__ModuleLoader__.load({id:'dsh-opencode',factory:(require)=>{var module={exports:{}};var exports=module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/shared/opencode.ts
/** Browser-safe identifiers shared by the Host metadata and Client UI. */
const CLIENT_MODULE_ID = "dsh-opencode";
const SETTINGS_NAMESPACE = "opencode-live";
const ROUTES = {
	zen: "opencode-zen-live",
	go: "opencode-go-live"
};
//#endregion
//#region src/client/OpenCodeCredentialForm.tsx
function OpenCodeCredentialForm(props) {
	const [draft, setDraft] = (0, react.useState)("");
	const [saving, setSaving] = (0, react.useState)(false);
	const [message, setMessage] = (0, react.useState)("");
	const [error, setError] = (0, react.useState)(false);
	const id = `opencode-api-key-${props.route}`;
	const unavailable = props.state.kind !== "known";
	const readOnly = props.state.kind === "known" && !props.state.writable;
	const disabled = saving || unavailable || readOnly;
	const submit = (event) => {
		event.preventDefault();
		if (props.state.kind !== "known") return;
		setSaving(true);
		setError(false);
		props.controller.save(props.route, draft, props.state.ref).then((result) => {
			setSaving(false);
			setMessage(result.message);
			setError(result.kind === "error");
			if (result.kind !== "error") setDraft("");
		});
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
		onSubmit: submit,
		noValidate: true,
		style: {
			display: "grid",
			gap: 10,
			padding: "16px 0"
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: props.route === "zen" ? "OpenCode Zen (Live)" : "OpenCode Go (Live)" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
				htmlFor: id,
				children: "OpenCode API key"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				id,
				type: "password",
				placeholder: props.state.kind === "known" && props.state.configured ? "Key saved — enter a new key to replace it" : "Paste your OpenCode API key",
				style: {
					width: "100%",
					boxSizing: "border-box",
					padding: "10px 12px",
					border: "1px solid #8886",
					borderRadius: 8,
					background: "transparent",
					color: "inherit",
					font: "inherit"
				},
				value: draft,
				onChange: (event) => setDraft(event.currentTarget.value),
				autoComplete: "new-password",
				spellCheck: false,
				disabled,
				"aria-invalid": error,
				"aria-describedby": `${id}-status`
			}),
			props.state.kind === "known" && props.state.sharedWith.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "This key is shared by OpenCode Zen and Go." }),
			unavailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: props.state.kind === "unavailable" ? props.state.reason : "Checking credential status…" }),
			readOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "This credential is read-only. Update it in the environment that launches DSH." }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				id: `${id}-status`,
				role: error ? "alert" : "status",
				"aria-live": "polite",
				children: message
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					gap: 8
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "submit",
					disabled: disabled || draft.trim().length === 0,
					style: {
						padding: "8px 16px",
						borderRadius: 8,
						cursor: "pointer"
					},
					children: saving ? "Saving…" : "Save API key"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: saving,
					onClick: () => {
						setDraft("");
						setMessage("");
						setError(false);
					},
					children: "Clear input"
				})]
			})
		]
	});
}
//#endregion
//#region src/client/credential-controller.ts
function routeFromProvider(value) {
	if (value === ROUTES.zen) return "zen";
	if (value === ROUTES.go) return "go";
}
function isRecord(value) {
	return typeof value === "object" && value !== null;
}
function unavailable(route, reason) {
	return {
		kind: "unavailable",
		route,
		reason
	};
}
function decodeDescribe(result, ref) {
	if (!isRecord(result) || result.ok !== true || !isRecord(result.value)) return void 0;
	const info = result.value[ref];
	if (!isRecord(info) || typeof info.configured !== "boolean" || typeof info.writable !== "boolean") return void 0;
	return {
		configured: info.configured,
		writable: info.writable,
		...typeof info.source === "string" ? { source: info.source } : {}
	};
}
function isSuccessfulWrite(result) {
	return isRecord(result) && result.ok === true;
}
var CredentialController = class {
	ctx;
	inFlight = /* @__PURE__ */ new Set();
	states = /* @__PURE__ */ new Map();
	generations = /* @__PURE__ */ new Map();
	subscriptions = [];
	disposed = false;
	disposalGeneration = 0;
	constructor(ctx) {
		this.ctx = ctx;
		const settings = ctx.settingsScope.describe();
		this.subscriptions.push(settings.subscribe(() => this.invalidate()));
		if (typeof ctx.remote.$on === "function") for (const event of ["credentials/reference-updated", "settings/document-updated"]) this.subscriptions.push(ctx.remote.$on(event, () => this.invalidate()));
		const events = ctx;
		if (typeof events.on === "function") this.subscriptions.push(events.on("connection/reset", () => this.invalidate()));
	}
	dispose() {
		this.disposed = true;
		this.disposalGeneration += 1;
		for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
		this.generations.clear();
		this.states.clear();
		this.inFlight.clear();
		this.listeners.clear();
	}
	subscribe(listener) {
		const listeners = this.listeners;
		listeners.add(listener);
		return () => listeners.delete(listener);
	}
	listeners = /* @__PURE__ */ new Set();
	reloadScheduled = false;
	invalidate() {
		if (this.disposed) return;
		for (const route of this.states.keys()) {
			this.generations.set(route, (this.generations.get(route) ?? 0) + 1);
			this.states.set(route, {
				kind: "loading",
				route
			});
		}
		for (const listener of this.listeners) listener();
		if (this.reloadScheduled) return;
		this.reloadScheduled = true;
		queueMicrotask(() => {
			this.reloadScheduled = false;
			if (!this.disposed) for (const route of this.states.keys()) this.loadRoute(route);
		});
	}
	currentSettings() {
		const face = this.ctx.settingsScope.describe();
		const snapshot = face.getSnapshot();
		if (snapshot.status !== "ready" || !isRecord(snapshot.view)) return void 0;
		const namespace = snapshot.view.namespaces.find((item) => item.ns === SETTINGS_NAMESPACE);
		if (namespace === void 0 || !isRecord(namespace.value)) return void 0;
		return {
			value: namespace.value,
			face
		};
	}
	refFor(value, route) {
		const ref = value.providers?.[ROUTES[route]]?.apiKeyEnv;
		return typeof ref === "string" && ref.length > 0 ? ref : void 0;
	}
	async loadRoute(route, signal) {
		const generation = (this.generations.get(route) ?? 0) + 1;
		this.generations.set(route, generation);
		this.states.set(route, {
			kind: "loading",
			route
		});
		if (signal?.aborted || this.disposed) return unavailable(route, "The credential check was cancelled.");
		const settings = this.ctx.settingsScope.describe();
		try {
			await settings.ensure();
			const current = this.currentSettings();
			if (current === void 0) return this.commit(route, generation, unavailable(route, "The configured credential reference is unavailable."));
			const ref = this.refFor(current.value, route);
			if (ref === void 0) return this.commit(route, generation, unavailable(route, "The configured credential reference is unavailable."));
			const info = decodeDescribe(await this.ctx.remote.credentials.describe([ref]), ref);
			if (info === void 0) return this.commit(route, generation, unavailable(route, "Could not check whether an API key is saved."));
			const sharedWith = [];
			for (const other of ["zen", "go"]) if (other !== route && this.refFor(current.value, other) === ref) sharedWith.push(other);
			if (signal?.aborted) return this.commit(route, generation, unavailable(route, "The credential check was cancelled."));
			return this.commit(route, generation, {
				kind: "known",
				route,
				ref,
				...info,
				sharedWith
			});
		} catch {
			return this.commit(route, generation, unavailable(route, "Could not load settings or credential status."));
		}
	}
	commit(route, generation, state) {
		if (!this.disposed && this.generations.get(route) === generation) {
			this.states.set(route, state);
			for (const listener of this.listeners) listener();
		}
		return this.states.get(route) ?? unavailable(route, "The settings form was closed.");
	}
	async loadRoutes(signal) {
		const [zen, go] = await Promise.all([this.loadRoute("zen", signal), this.loadRoute("go", signal)]);
		return {
			zen,
			go
		};
	}
	state(route) {
		return this.states.get(route);
	}
	async save(route, value, displayedRef) {
		const normalized = value.trim();
		if (normalized.length === 0 || /[\r\n]/.test(normalized) || /^['"].*['"]$/.test(normalized) || normalized.includes("=")) return {
			kind: "error",
			message: "Paste the API key only, without quotes or an environment-variable assignment."
		};
		const displayed = this.states.get(route);
		const fence = this.disposalGeneration;
		const current = await this.loadRoute(route);
		if (this.disposed || this.disposalGeneration !== fence) return {
			kind: "error",
			message: "The settings form was closed. Open it again and retry."
		};
		if (displayed?.kind !== "known" || current.kind !== "known" || displayed.ref !== displayedRef || current.ref !== displayedRef) return {
			kind: "error",
			message: "The credential reference changed. Reload its status and retry."
		};
		if (!current.writable) return {
			kind: "error",
			message: "This credential is read-only. Update it in the environment that launches DSH."
		};
		if (this.inFlight.has(current.ref)) return {
			kind: "error",
			message: "This credential is already being saved."
		};
		this.inFlight.add(current.ref);
		try {
			if (this.disposed || this.disposalGeneration !== fence) return {
				kind: "error",
				message: "The settings form was closed. Open it again and retry."
			};
			if (!isSuccessfulWrite(await this.ctx.remote.credentials.set(current.ref, normalized))) return {
				kind: "error",
				message: "Could not save the API key."
			};
			const confirmed = await this.loadRoute(route);
			for (const other of current.sharedWith) await this.loadRoute(other);
			return confirmed.kind === "known" && confirmed.configured ? {
				kind: "saved",
				message: "API key saved."
			} : {
				kind: "saved-unconfirmed",
				message: "The key was saved, but its status could not be confirmed."
			};
		} catch {
			return {
				kind: "error",
				message: "Could not save the API key."
			};
		} finally {
			this.inFlight.delete(current.ref);
		}
	}
};
//#endregion
//#region src/client/OpenCodeProviderCard.tsx
function OpenCodeProviderCard(props) {
	const route = routeFromProvider(props.provider.provider);
	const [state, setState] = (0, react.useState)(() => ({
		kind: "loading",
		route: route ?? "zen"
	}));
	(0, react.useEffect)(() => {
		if (route === void 0) return;
		let active = true;
		const dispose = props.controller.subscribe(() => {
			const next = props.controller.state(route);
			if (active && next !== void 0) setState(next);
		});
		props.controller.loadRoute(route).then((next) => {
			if (active) setState(next);
		});
		return () => {
			active = false;
			dispose();
		};
	}, [props.controller, route]);
	if (route === void 0) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
		"data-dsh-opencode-provider": route,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenCodeCredentialForm, {
			route,
			state,
			controller: props.controller
		})
	});
}
//#endregion
//#region src/client/index.ts
/** Settings must work without a session, slash commands, or a shell overlay. */
const inject = [
	"remote",
	"remote.credentials",
	"settingsScope",
	"slots"
];
function apply(ctx) {
	ctx.effect(function* () {
		const controller = new CredentialController(ctx);
		yield () => controller.dispose();
		yield ctx.slots.inject("settings.models.provider-card", () => ctx.slots.register({
			name: "settings.models.provider-card",
			key: "opencode-live",
			inject: () => ({ controller })
		}, OpenCodeProviderCard));
	}, `${CLIENT_MODULE_ID}: provider settings`);
}
//#endregion
exports.apply = apply;
exports.inject = inject;

return module.exports;}});