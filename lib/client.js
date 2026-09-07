window.__ModuleLoader__.load({id:'dsh-opencode',factory:(require)=>{var module={exports:{}};var exports=module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/shared/opencode.ts
/** Browser-safe identifiers shared by the Host metadata and Client UI. */
const CLIENT_MODULE_ID = "dsh-opencode";
const SETTINGS_NAMESPACE = "opencode-live";
const ROUTES = {
	zen: "opencode-zen-live",
	go: "opencode-go-live"
};
const HELP_URLS = {
	auth: "https://opencode.ai/auth",
	zen: "https://opencode.ai/docs/zen/",
	go: "https://opencode.ai/docs/go/"
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
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: props.route === "zen" ? "OpenCode Zen (Live)" : "OpenCode Go (Live)" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
				htmlFor: id,
				children: "OpenCode API キー"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				id,
				type: "password",
				value: draft,
				onChange: (event) => setDraft(event.currentTarget.value),
				autoComplete: "new-password",
				spellCheck: false,
				disabled,
				"aria-invalid": error,
				"aria-describedby": `${id}-status`
			}),
			unavailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: props.state.kind === "unavailable" ? props.state.reason : "状態を確認中です。" }),
			readOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "この認証参照は読み取り専用です。" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				id: `${id}-status`,
				role: error ? "alert" : "status",
				"aria-live": "polite",
				children: message
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				type: "submit",
				variant: "primary",
				disabled,
				children: "保存"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				type: "button",
				variant: "ghost",
				onClick: () => {
					setDraft("");
					props.onCancel();
				},
				children: "キャンセル"
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
	}
	subscribe(listener) {
		const listeners = this.listeners;
		listeners.add(listener);
		return () => listeners.delete(listener);
	}
	listeners = /* @__PURE__ */ new Set();
	invalidate() {
		for (const route of ["zen", "go"]) this.generations.set(route, (this.generations.get(route) ?? 0) + 1);
		for (const listener of this.listeners) listener();
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
		if (signal?.aborted || this.disposed) return unavailable(route, "確認がキャンセルされました。");
		const settings = this.ctx.settingsScope.describe();
		try {
			await settings.ensure();
			const current = this.currentSettings();
			if (current === void 0) return this.commit(route, generation, unavailable(route, "設定の credential reference を確認できません。"));
			const ref = this.refFor(current.value, route);
			if (ref === void 0) return this.commit(route, generation, unavailable(route, "設定の credential reference を確認できません。"));
			const info = decodeDescribe(await this.ctx.remote.credentials.describe([ref]), ref);
			if (info === void 0) return this.commit(route, generation, unavailable(route, "認証状態を確認できません。"));
			const sharedWith = [];
			for (const other of ["zen", "go"]) if (other !== route && this.refFor(current.value, other) === ref) sharedWith.push(other);
			return this.commit(route, generation, {
				kind: "known",
				route,
				ref,
				...info,
				sharedWith
			});
		} catch {
			return this.commit(route, generation, unavailable(route, "設定または認証状態を確認できません。"));
		}
	}
	commit(route, generation, state) {
		if (!this.disposed && this.generations.get(route) === generation) {
			this.states.set(route, state);
			for (const listener of this.listeners) listener();
		}
		return state;
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
			message: "API キーの形式を確認してください。"
		};
		const displayed = this.states.get(route);
		const fence = this.disposalGeneration;
		const current = await this.loadRoute(route);
		if (this.disposed || this.disposalGeneration !== fence) return {
			kind: "error",
			message: "設定画面が閉じられました。再試行してください。"
		};
		if (displayed?.kind !== "known" || current.kind !== "known" || displayed.ref !== displayedRef || current.ref !== displayedRef) return {
			kind: "error",
			message: "設定が更新されました。状態を再読み込みしてから再試行してください。"
		};
		if (!current.writable) return {
			kind: "error",
			message: "この認証参照は読み取り専用です。"
		};
		if (this.inFlight.has(current.ref)) return {
			kind: "error",
			message: "同じ認証参照の保存が進行中です。"
		};
		this.inFlight.add(current.ref);
		try {
			if (this.disposed || this.disposalGeneration !== fence) return {
				kind: "error",
				message: "設定画面が閉じられました。再試行してください。"
			};
			if (!isSuccessfulWrite(await this.ctx.remote.credentials.set(current.ref, normalized))) return {
				kind: "error",
				message: "API キーを保存できませんでした。"
			};
			const confirmed = await this.loadRoute(route);
			return confirmed.kind === "known" && confirmed.configured ? {
				kind: "saved",
				message: "保存しました。キーの値は表示しません。"
			} : {
				kind: "saved-unconfirmed",
				message: "保存要求は成功しましたが、状態を再確認できませんでした。"
			};
		} catch {
			return {
				kind: "error",
				message: "API キーを保存できませんでした。"
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
			controller: props.controller,
			onCancel: () => void 0
		})
	});
}
//#endregion
//#region src/client/OpenCodeSetupDialog.tsx
function OpenCodeSetupDialog(props) {
	const snapshot = (0, react.useSyncExternalStore)(props.controller.subscribe, props.controller.getSnapshot, props.controller.getSnapshot);
	if (!snapshot.open) return null;
	const close = () => props.controller.close();
	const body = snapshot.route === "status" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		role: "status",
		children: [snapshot.message ?? "設定状況を確認しました。", /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusRows, { controller: props.controller })]
	}) : snapshot.route === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CredentialFormForRoute, {
		route: snapshot.route,
		controller: props.controller,
		onCancel: close
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
		open: true,
		onClose: close,
		title: "OpenCode API キー設定",
		closeLabel: "閉じる",
		description: "キーの値は表示しません。",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "OpenCode にサインインし、Zen または Go の API キーを作成して保存してください。" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
					href: HELP_URLS.auth,
					target: "_blank",
					rel: "noopener noreferrer",
					children: "サインイン"
				}),
				" | ",
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
					href: HELP_URLS.zen,
					target: "_blank",
					rel: "noopener noreferrer",
					children: "Zen の手順"
				}),
				" | ",
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
					href: HELP_URLS.go,
					target: "_blank",
					rel: "noopener noreferrer",
					children: "Go の手順"
				})
			] }),
			body,
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				type: "button",
				variant: "ghost",
				onClick: close,
				children: "キャンセル"
			})
		]
	});
}
function CredentialFormForRoute(props) {
	const state = props.controller.state(props.route) ?? {
		kind: "loading",
		route: props.route
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenCodeCredentialForm, {
		route: props.route,
		state,
		controller: props.controller.credentials,
		onCancel: props.onCancel
	});
}
function StatusRows(props) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: ["zen", "go"].map((route) => {
		const state = props.controller.state(route);
		const text = state?.kind === "known" ? state.configured ? "API キー保存済み" : "API キー未設定" : state?.kind === "unavailable" ? state.reason : "状態を確認中です";
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
			route === "zen" ? "Zen" : "Go",
			": ",
			text
		] }, route);
	}) });
}
//#endregion
//#region src/client/setup-controller.ts
var SetupController = class {
	ctx;
	credentials;
	current = { open: false };
	listeners = /* @__PURE__ */ new Set();
	constructor(ctx) {
		this.ctx = ctx;
		this.credentials = new CredentialController(ctx);
	}
	getSnapshot = () => this.current;
	subscribe = (listener) => {
		this.listeners.add(listener);
		const credentialDispose = this.credentials.subscribe(listener);
		return () => {
			this.listeners.delete(listener);
			credentialDispose();
		};
	};
	dispose() {
		this.credentials.dispose();
		this.listeners.clear();
		this.close();
	}
	update(next) {
		this.current = next;
		for (const listener of this.listeners) listener();
	}
	open(route, message) {
		this.update({
			open: true,
			route,
			...message === void 0 ? {} : { message }
		});
	}
	close() {
		this.update({ open: false });
	}
	sessionId;
	async select(option, sessionId) {
		this.sessionId = sessionId;
		if (option.id === "zen" || option.id === "go") {
			this.open(option.id);
			await this.credentials.loadRoute(option.id);
			return;
		}
		if (option.id === "status") {
			this.open("status", "設定状況を確認中…");
			await this.credentials.loadRoutes();
			return;
		}
		if (option.id === "refresh") {
			this.open("status", "モデル一覧を更新中…");
			const execute = commandsExecute(this.ctx);
			if (execute === void 0 || this.sessionId === void 0) {
				this.open("status", "更新コマンドを利用できません。/opencode-refresh all を実行してください。");
				return;
			}
			try {
				const result = await execute(this.sessionId, "/opencode-refresh all", [], void 0);
				this.open("status", result.ok ? "モデル一覧の更新コマンドを送信しました。" : "モデル一覧を更新できませんでした。");
			} catch {
				this.open("status", "モデル一覧を更新できませんでした。");
			}
		}
	}
	state(route) {
		return this.credentials.state(route);
	}
};
function commandsExecute(ctx) {
	const commands = ctx.remote.commands;
	if (typeof commands !== "object" || commands === null) return void 0;
	const execute = commands.execute;
	return typeof execute === "function" ? execute.bind(commands) : void 0;
}
//#endregion
//#region src/client/index.ts
const services = [
	"commandUi",
	"remote.credentials",
	"remote.commands",
	"settingsScope",
	"slots"
];
function apply(ctx) {
	ctx.inject(services, (injected) => {
		const client = injected;
		client.effect(() => {
			const setup = new SetupController(client);
			const disposers = [];
			disposers.push(client.commandUi.decorate({
				name: "dsh-opencode",
				available: () => true,
				ui: {
					kind: "popupSelect",
					options: async (_session, signal) => {
						const states = await setup.credentials.loadRoutes(signal);
						const options = ["zen", "go"].map((route) => {
							const state = states[route];
							return {
								id: route,
								label: route === "zen" ? "OpenCode Zen を設定" : "OpenCode Go を設定",
								detail: state.kind === "known" ? state.configured ? "API キー保存済み" : "API キー未設定" : state.kind === "unavailable" ? state.reason : "状態を確認中です",
								active: state.kind === "known" && state.configured
							};
						});
						options.push({
							id: "status",
							label: "設定状況を確認",
							detail: "キーの値は表示しません"
						}, {
							id: "refresh",
							label: "モデル一覧を更新",
							detail: "Host の更新コマンドを実行してください"
						});
						return options;
					},
					onSelect: (option, session) => {
						setup.select(option, session.sessionId);
					}
				}
			}));
			disposers.push(client.slots.inject("settings.models.provider-card", () => client.slots.register({
				name: "settings.models.provider-card",
				key: "opencode-live",
				inject: () => ({ controller: setup.credentials })
			}, OpenCodeProviderCard)));
			disposers.push(client.slots.inject("shell.overlay", () => client.slots.register({
				name: "shell.overlay",
				id: "opencode-live-setup",
				inject: () => ({ controller: setup })
			}, OpenCodeSetupDialog)));
			return () => {
				setup.dispose();
				for (const dispose of disposers.splice(0)) dispose();
			};
		}, `${CLIENT_MODULE_ID}: client registrations`);
	});
}
//#endregion
exports.SetupController = SetupController;
exports.apply = apply;

return module.exports;}});