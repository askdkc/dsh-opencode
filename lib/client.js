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
//#region src/shared/language.ts
/** Explicit DSH preference wins; otherwise use the primary browser/OS locale. */
function resolveLanguage(preference, fallback) {
	const locale = typeof preference === "string" && preference.trim() ? preference : fallback;
	return /^ja(?:[-_.@]|$)/i.test(locale?.trim() ?? "") ? "ja" : "en";
}
function localePreference(value) {
	return typeof value === "object" && value !== null && "preference" in value ? value.preference : void 0;
}
[
	"1. Open Settings > Models.",
	"2. Enter your API key in the OpenCode provider you want to use.",
	"3. Click \"Save API key\"."
].join("\n");
const setupUsage = "Enter your API key in Settings > Models, not in chat.";
const setupSaved = "Your OpenCode API key is saved. Choose an OpenCode model from the model picker at the bottom right of the chat.";
const setupCancelled = "The check was cancelled.";
/** English source copy is the key. Only our known copy is translated. */
const japanese = {
	"OpenCode settings": "OpenCode の設定",
	"Close": "閉じる",
	"OpenCode API key": "OpenCode APIキー",
	"Key saved — enter a new key to replace it": "保存済みです。変更する場合は新しいキーを入力してください",
	"Paste your OpenCode API key": "OpenCodeのAPIキーを貼り付けてください",
	"This key is shared by OpenCode Zen and Go. Deleting it removes the key for both providers.": "このキーはOpenCode ZenとGoで共有しています。削除すると両方のキー設定が解除されます。",
	"Checking credential status…": "APIキーの設定を確認しています…",
	"Saving…": "保存中…",
	"Save API key": "APIキーを保存",
	"Deleting…": "削除中…",
	"Delete API key": "APIキーを削除",
	"Clear input": "入力を消去",
	"The credential check was cancelled.": "APIキーの確認をキャンセルしました。",
	"The configured credential reference is unavailable.": "APIキーの保存先を確認できませんでした。",
	"Could not check whether an API key is saved.": "APIキーが保存されているか確認できませんでした。",
	"Could not load settings or credential status.": "設定またはAPIキーの状態を読み込めませんでした。",
	"The settings form was closed.": "設定画面が閉じられました。",
	"The settings form was closed. Open it again and retry.": "設定画面が閉じられました。開き直して再試行してください。",
	"The API key settings changed. Check which providers share the key and retry.": "APIキーの設定が変更されました。キーを共有するプロバイダーを確認して再試行してください。",
	"This credential is read-only. Remove it from the environment that launches DSH.": "このAPIキーは読み取り専用です。DSHを起動する環境の設定から削除してください。",
	"This credential is already being updated.": "このAPIキーは更新中です。完了後に再試行してください。",
	"Could not delete the API key. Try again.": "APIキーを削除できませんでした。再試行してください。",
	"The deletion request succeeded, but the key status could not be confirmed. Reload Settings > Models.": "削除リクエストは成功しましたが、キーの状態を確認できませんでした。Settings > Modelsを開き直してください。",
	"The saved key was removed, but an API key is still configured. Check its source in Settings > Models.": "保存したキーは削除されましたが、別のAPIキー設定が残っています。Settings > Modelsで設定元を確認してください。",
	"API key deleted for OpenCode Zen and Go.": "OpenCode ZenとGoの共有APIキーを削除しました。",
	"API key deleted.": "APIキーを削除しました。",
	"Paste the API key only, without quotes or an environment-variable assignment.": "引用符や環境変数の代入式を含めず、APIキーだけを貼り付けてください。",
	"The credential reference changed. Reload its status and retry.": "APIキーの保存先が変更されました。状態を読み込み直して再試行してください。",
	"This credential is read-only. Update it in the environment that launches DSH.": "このAPIキーは読み取り専用です。DSHを起動する環境の設定で変更してください。",
	"Could not save the API key.": "APIキーを保存できませんでした。",
	"The API key is not configured. Enter it in Settings > Models, click \"Save API key\", then send your message again.": "APIキーが未設定です。Settings > ModelsでAPIキーを入力して「APIキーを保存」を押してから、もう一度送信してください。",
	"API key saved.": "APIキーを保存しました。",
	"The key was saved, but its status could not be confirmed.": "APIキーを保存しましたが、保存後の状態を確認できませんでした。",
	"1. Open Settings > Models.": "1. Settings > Modelsを開きます。",
	"2. Enter your API key in the OpenCode provider you want to use.": "2. 使用するOpenCodeの欄にAPIキーを入力します。",
	"3. Click \"Save API key\".": "3. 「APIキーを保存」を押してください。",
	[setupUsage]: "APIキーはチャットに入力せず、Settings > Modelsから設定してください。",
	[setupSaved]: "OpenCodeのAPIキーは保存されています。チャット右下のモデル選択から、使いたいOpenCodeのモデルを選んでください。",
	[setupCancelled]: "確認をキャンセルしました。"
};
for (const label of [
	"OpenCode",
	"OpenCode Zen",
	"OpenCode Go",
	"OpenCode Zen and OpenCode Go"
]) {
	const jaLabel = label.replace(" and ", "・");
	japanese[`${label} API key is not configured.`] = `${jaLabel}のAPIキーが未設定です。`;
	japanese[`Could not check the API key settings for ${label}.`] = `${jaLabel}のAPIキー設定を確認できませんでした。`;
}
const english = new Map(Object.entries(japanese).map(([en, ja]) => [ja, en]));
function translate(text, language) {
	return text.split("\n").map((line) => {
		const source = english.get(line) ?? line;
		return language === "ja" ? japanese[source] ?? line : source;
	}).join("\n");
}
//#endregion
//#region src/client/language.ts
/** Read the durable preference without registering languages or changing DSH settings. */
var LanguageController = class {
	ctx;
	listeners = /* @__PURE__ */ new Set();
	unsubscribe;
	language;
	disposed = false;
	constructor(ctx) {
		this.ctx = ctx;
		this.language = this.read();
		this.unsubscribe = ctx.settingsScope.describe().subscribe(this.refresh);
		if (typeof window !== "undefined") window.addEventListener?.("languagechange", this.refresh);
		ctx.settingsScope.describe().ensure().then(this.refresh, () => void 0);
	}
	read() {
		const snapshot = this.ctx.settingsScope.describe().getSnapshot();
		const value = snapshot.status === "ready" ? snapshot.view?.namespaces.find((item) => item.ns === "locale")?.value : void 0;
		const browser = typeof navigator === "undefined" ? void 0 : navigator.languages?.[0] || navigator.language;
		return resolveLanguage(localePreference(value), browser);
	}
	refresh = () => {
		if (this.disposed) return;
		const next = this.read();
		if (this.language === next) return;
		this.language = next;
		for (const listener of this.listeners) listener();
	};
	getSnapshot = () => this.language;
	subscribe = (listener) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	dispose() {
		this.disposed = true;
		this.unsubscribe();
		if (typeof window !== "undefined") window.removeEventListener?.("languagechange", this.refresh);
		this.listeners.clear();
	}
};
function useTranslation(controller) {
	const language = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
	return (text) => translate(text, language);
}
//#endregion
//#region src/client/OpenCodeCredentialForm.tsx
function OpenCodeCredentialForm(props) {
	const t = useTranslation(props.language);
	const [draft, setDraft] = (0, react.useState)("");
	const [action, setAction] = (0, react.useState)();
	const saving = action !== void 0;
	const [message, setMessage] = (0, react.useState)("");
	const [error, setError] = (0, react.useState)(false);
	const id = `opencode-api-key-${props.route}`;
	const unavailable = props.state.kind !== "known";
	const readOnly = props.state.kind === "known" && !props.state.writable;
	const disabled = saving || unavailable || readOnly;
	const submit = (event) => {
		event.preventDefault();
		if (props.state.kind !== "known") return;
		setAction("save");
		setError(false);
		props.controller.save(props.route, draft, props.state.ref).then((result) => {
			setAction(void 0);
			setMessage(result.message);
			setError(result.kind === "error");
			if (result.kind !== "error") setDraft("");
		});
	};
	const remove = () => {
		if (saving || props.state.kind !== "known" || !props.state.configured || !props.state.writable) return;
		setAction("delete");
		setError(false);
		setMessage("");
		props.controller.remove(props.route, props.state.ref).then((result) => {
			setAction(void 0);
			setMessage(result.message);
			setError(result.kind === "error");
			if (result.kind !== "error") setDraft("");
		});
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
		lang: props.language.getSnapshot(),
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
				children: t("OpenCode API key")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				id,
				type: "password",
				placeholder: props.state.kind === "known" && props.state.configured ? t("Key saved — enter a new key to replace it") : t("Paste your OpenCode API key"),
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
			props.state.kind === "known" && props.state.sharedWith.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("This key is shared by OpenCode Zen and Go. Deleting it removes the key for both providers.") }),
			unavailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(props.state.kind === "unavailable" ? props.state.reason : "Checking credential status…") }),
			readOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("This credential is read-only. Update it in the environment that launches DSH.") }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				id: `${id}-status`,
				role: error ? "alert" : "status",
				"aria-live": "polite",
				children: t(message)
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexWrap: "wrap",
					gap: 8
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						disabled: disabled || draft.trim().length === 0,
						style: {
							padding: "8px 16px",
							borderRadius: 8,
							cursor: "pointer"
						},
						children: t(action === "save" ? "Saving…" : "Save API key")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: disabled || props.state.kind !== "known" || !props.state.configured,
						onClick: remove,
						style: {
							padding: "8px 16px",
							borderRadius: 8,
							color: "#b42318"
						},
						children: t(action === "delete" ? "Deleting…" : "Delete API key")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: saving,
						onClick: () => {
							setDraft("");
							setMessage("");
							setError(false);
						},
						children: t("Clear input")
					})
				]
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
	/** Remove the saved credential, preserving the provider and its reference. */
	async remove(route, displayedRef) {
		const displayed = this.states.get(route);
		const fence = this.disposalGeneration;
		const current = await this.loadRoute(route);
		if (this.disposed || this.disposalGeneration !== fence) return {
			kind: "error",
			message: "The settings form was closed. Open it again and retry."
		};
		if (displayed?.kind !== "known" || current.kind !== "known" || displayed.ref !== displayedRef || current.ref !== displayedRef || displayed.sharedWith.join(",") !== current.sharedWith.join(",")) return {
			kind: "error",
			message: "The API key settings changed. Check which providers share the key and retry."
		};
		if (!current.writable) return {
			kind: "error",
			message: "This credential is read-only. Remove it from the environment that launches DSH."
		};
		if (this.inFlight.has(current.ref)) return {
			kind: "error",
			message: "This credential is already being updated."
		};
		this.inFlight.add(current.ref);
		try {
			if (!isSuccessfulWrite(await this.ctx.remote.credentials.unset(current.ref))) return {
				kind: "error",
				message: "Could not delete the API key. Try again."
			};
			await Promise.all([route, ...current.sharedWith].map((other) => this.loadRoute(other)));
			const confirmed = this.state(route);
			if (confirmed?.kind !== "known" || confirmed.ref !== current.ref) return {
				kind: "deleted-unconfirmed",
				message: "The deletion request succeeded, but the key status could not be confirmed. Reload Settings > Models."
			};
			if (confirmed.configured) return {
				kind: "deleted-unconfirmed",
				message: "The saved key was removed, but an API key is still configured. Check its source in Settings > Models."
			};
			return {
				kind: "deleted",
				message: current.sharedWith.length > 0 ? "API key deleted for OpenCode Zen and Go." : "API key deleted."
			};
		} catch {
			return {
				kind: "error",
				message: "Could not delete the API key. Try again."
			};
		} finally {
			this.inFlight.delete(current.ref);
		}
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
			message: "This credential is already being updated."
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
			controller: props.controller,
			language: props.language
		})
	});
}
//#endregion
//#region src/client/CommandNotice.tsx
/** Native modal keeps the full message readable and owns focus and Escape. */
function CommandNotice({ controller, language }) {
	const t = useTranslation(language);
	const text = (0, react.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
	const dialog = (0, react.useRef)(null);
	const titleId = (0, react.useId)();
	const bodyId = (0, react.useId)();
	(0, react.useEffect)(() => {
		const element = dialog.current;
		if (text === void 0 || element === null) return;
		element.showModal();
		return () => {
			element.close();
		};
	}, [text]);
	if (text === void 0) return null;
	const lines = t(text).split("\n");
	const stepStart = lines.findIndex((line) => /^\d+\. /.test(line));
	const hasSteps = stepStart >= 0 && lines.slice(stepStart).every((line) => /^\d+\. /.test(line));
	const summary = hasSteps ? lines.slice(0, stepStart).join("\n") : t(text);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dialog", {
		lang: language.getSnapshot(),
		ref: dialog,
		className: "dsh-opencode-notice",
		"aria-labelledby": titleId,
		"aria-describedby": bodyId,
		onCancel: (event) => {
			event.preventDefault();
			controller.close();
		},
		style: {
			width: "min(520px, calc(100vw - 32px))",
			maxHeight: "calc(100dvh - 32px)",
			boxSizing: "border-box",
			padding: 28,
			border: "1px solid #8884",
			borderRadius: 16,
			background: "Canvas",
			color: "CanvasText",
			boxShadow: "0 16px 64px #0003",
			pointerEvents: "auto",
			overflow: "auto"
		},
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: ".dsh-opencode-notice::backdrop { background: rgb(0 0 0 / 35%); }" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				id: titleId,
				style: {
					margin: "0 0 20px",
					fontSize: 22
				},
				children: t("OpenCode settings")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				id: bodyId,
				style: {
					fontSize: 16,
					lineHeight: 1.8,
					overflowWrap: "anywhere"
				},
				children: [summary && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: {
						margin: "0 0 16px",
						whiteSpace: "pre-wrap",
						fontWeight: 600
					},
					children: summary
				}), hasSteps && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", {
					style: {
						margin: 0,
						paddingLeft: 24
					},
					children: lines.slice(stepStart).map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
						style: {
							paddingLeft: 4,
							marginTop: 10
						},
						children: line.replace(/^\d+\. /, "")
					}, index))
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					justifyContent: "flex-end",
					marginTop: 24
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					autoFocus: true,
					type: "button",
					onClick: controller.close,
					style: {
						padding: "10px 24px",
						border: "1px solid #8886",
						borderRadius: 8,
						font: "inherit",
						cursor: "pointer"
					},
					children: t("Close")
				})
			})
		]
	});
}
//#endregion
//#region src/client/command-notice.ts
/** Browser-local notice: only a command submitted here opens it. */
var CommandNoticeController = class {
	text;
	listeners = /* @__PURE__ */ new Set();
	getSnapshot = () => this.text;
	subscribe = (listener) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	show(name, result) {
		if (name !== "dsh-opencode" || !result.text?.trim()) return;
		this.text = result.text;
		this.notify();
	}
	close = () => {
		this.text = void 0;
		this.notify();
	};
	dispose() {
		this.text = void 0;
		this.listeners.clear();
	}
	notify() {
		for (const listener of this.listeners) listener();
	}
};
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
	const language = new LanguageController(ctx);
	ctx.effect(() => () => language.dispose());
	ctx.effect(function* () {
		const controller = new CredentialController(ctx);
		yield () => controller.dispose();
		yield ctx.slots.inject("settings.models.provider-card", () => ctx.slots.register({
			name: "settings.models.provider-card",
			key: "opencode-live",
			inject: () => ({
				controller,
				language
			})
		}, OpenCodeProviderCard));
	}, `${CLIENT_MODULE_ID}: provider settings`);
	ctx.slots.inject("shell.overlay", function* () {
		const notice = new CommandNoticeController();
		yield () => notice.dispose();
		yield ctx.on("command/executed", (_sessionId, name, result) => notice.show(name, result));
		yield ctx.slots.register({
			name: "shell.overlay",
			id: "opencode-command-notice",
			inject: () => ({
				controller: notice,
				language
			})
		}, CommandNotice);
	});
}
//#endregion
exports.apply = apply;
exports.inject = inject;

return module.exports;}});