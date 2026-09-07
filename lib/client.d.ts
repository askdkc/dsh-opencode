
import { Context } from "@deepseek-ai/cordis";

//#region src/client/index.d.ts
/** Settings must work without a session, slash commands, or a shell overlay. */
declare const inject: string[];
declare function apply(ctx: Context): void;
//#endregion
export { apply, inject };
