/**
 * The one place this plugin writes an OpenCode API key.
 *
 * The key never rides a slash-command argument or a log line: it arrives as
 * the value of a free-form command input field and is handed, once, to the DSH
 * credential seam (`credentials.set`). The reference is the resolved profile's
 * `apiKeyEnv` (default `OPENCODE_API_KEY`), so a key written here is the same
 * one the live routes read per request.
 *
 * A key write must never touch anything else. The verification below proves
 * that: it snapshots the `opencode-live` settings section and every configured
 * credential reference before the write, then asserts a key store changed
 * nothing but the intended reference — no section edit, no other reference.
 *
 * @module opencode-live/keyring
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { LlmError, assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import type { ResolvedProviderConfig } from './config.ts'
import { SETTINGS_NAMESPACE } from './index.ts'

/** The provider configs the keyring writes against. */
export type ProviderConfigs = Iterable<ResolvedProviderConfig>

/** A credential reference's before/after state. */
interface RefState {
  configured: boolean
  writable: boolean
}

/**
 * Read one reference's presence, treating an absent credential service as a
 * stable `false` rather than a throw: the caller wants facts, not a diagnosis.
 */
async function refState(ctx: Context, ref: CredentialRef): Promise<RefState> {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return { configured: false, writable: false }
  const described = await credentials.describe(ref)
  return described === undefined
    ? { configured: false, writable: false }
    : { configured: described.configured, writable: described.writable }
}

/** Snapshot of everything a key store must leave untouched. */
interface KeyringSnapshot {
  /** Resolved `opencode-live` settings section, JSON-stable. */
  section: string
  /** Configured state of every credential reference the plugin resolves. */
  refs: ReadonlyMap<CredentialRef, RefState>
}

/**
 * Read the state a key store is about to operate against.
 * @param ctx - the plugin context.
 * @param providers - the currently resolved provider profiles.
 * @returns the immutable snapshot for before/after comparison.
 */
export async function snapshotKeyring(
  ctx: Context,
  providers: ProviderConfigs,
): Promise<KeyringSnapshot> {
  const settings = ctx.get('settings')
  const sectionValue = settings === undefined ? undefined : settings.get(SETTINGS_NAMESPACE)
  const refs = new Map<CredentialRef, RefState>()
  for (const { apiKeyEnv } of providers) {
    if (!refs.has(apiKeyEnv)) refs.set(apiKeyEnv, await refState(ctx, apiKeyEnv))
  }
  return {
    section: JSON.stringify(sectionValue ?? null),
    refs,
  }
}

/**
 * Verify a key store left no stray change. Compares the section snapshot and
 * every reference the plugin knows with a stable JSON text, so a change in
 * either is caught regardless of ordering.
 * @param before - the snapshot taken before the store.
 * @param after - the snapshot taken after the store.
 * @param refs - the references the store wrote (the only ones allowed to move).
 * @returns a failure line, or `undefined` when only the intended refs changed.
 */
export function verifyNoStrayChange(
  before: KeyringSnapshot,
  after: KeyringSnapshot,
  refs: readonly CredentialRef[],
): string | undefined {
  if (before.section !== after.section) {
    return `opencode-live: the settings section changed while storing the key (${SETTINGS_NAMESPACE})`
  }
  for (const [ref, state] of before.refs) {
    const next = after.refs.get(ref)
    if (next === undefined) return `opencode-live: credential ${ref} vanished after storing the key`
    if (state.configured === next.configured && state.writable === next.writable) continue
    if (!refs.includes(ref)) {
      return `opencode-live: an unrelated credential reference changed (${ref})`
    }
  }
  for (const [ref, next] of after.refs) {
    if (before.refs.has(ref)) continue
    if (!refs.includes(ref)) {
      return `opencode-live: an unrelated credential reference appeared (${ref})`
    }
    if (!next.configured) {
      return `opencode-live: the stored reference ${ref} did not become configured`
    }
  }
  return undefined
}

/**
 * Store one OpenCode key through the DSH credential seam.
 *
 * This is the whole write surface a command uses. Validation runs before any
 * write, so a key that would be refused is never persisted. The write is
 * fenced by `snapshotKeyring` before and after; a stray settings or unrelated
 * credential change fails the call with a diagnostic instead of silently
 * committing alongside the key.
 * @param ctx - the plugin context.
 * @param providers - the currently resolved provider profiles.
 * @param value - the key typed into the command's input field.
 * @returns `undefined` on success, or a failure line naming the exact problem.
 */
export async function storeApiKey(
  ctx: Context,
  providers: ProviderConfigs,
  value: string,
): Promise<string | undefined> {
  try {
    assertUsableApiKey(value, 'opencode-live', 'input')
  } catch (error) {
    return (error as Error).message
  }
  const credentials = ctx.get('credentials')
  if (credentials === undefined) {
    return 'opencode-live: no credentials service is mounted; export the API key in the launch environment instead'
  }

  // The key is written to every configured reference (both routes default to
  // one shared reference, so this is normally a single write). Snapshot before,
  // write, snapshot after, then prove nothing else moved.
  const before = await snapshotKeyring(ctx, providers)
  const targets = [...new Set([...providers].map(({ apiKeyEnv }) => apiKeyEnv))]
  try {
    for (const ref of targets) await credentials.set(ref, value)
  } catch (error) {
    return `opencode-live: could not store the API key (${(error as Error).message})`
  }
  const after = await snapshotKeyring(ctx, providers)
  return verifyNoStrayChange(before, after, targets)
}

/**
 * Presence facts for the status path: whether a key is configured, without
 * ever exposing a value.
 * @param ctx - the plugin context.
 * @param providers - the currently resolved provider profiles.
 * @returns whether the shared reference is configured.
 */
export async function keyConfigured(
  ctx: Context,
  providers: ProviderConfigs,
): Promise<boolean> {
  const refs = [...new Set([...providers].map(({ apiKeyEnv }) => apiKeyEnv))]
  const states = await Promise.all(refs.map(ref => refState(ctx, ref)))
  return states.some(state => state.configured)
}

/** Whether any reference is read-only, so the status can say so. */
export async function keyReadonly(
  ctx: Context,
  providers: ProviderConfigs,
): Promise<boolean> {
  const refs = [...new Set([...providers].map(({ apiKeyEnv }) => apiKeyEnv))]
  const states = await Promise.all(refs.map(ref => refState(ctx, ref)))
  return states.some(state => !state.writable)
}
