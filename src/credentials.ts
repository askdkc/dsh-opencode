/**
 * The bridge between the DSH credential seam and pi-ai's auth model.
 *
 * Key resolution is explicit: the configured reference is resolved per call
 * through `ctx.credentials` (or the launch environment when no credential
 * service is mounted), validated, and handed to that one request only. No
 * ambient discovery of unrelated provider keys happens anywhere on this side:
 * the pi-ai auth methods resolve from the request credential alone, the
 * stored-credential surface is inert, and the auth context answers nothing.
 *
 * @module opencode-live/credentials
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { LlmError, assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ApiKeyAuth, AuthContext, CredentialStore } from '@earendil-works/pi-ai'

/** The two auth injectables pi-ai's `createModels()` accepts (public shape). */
interface PiAiAuthBridge {
  credentials: CredentialStore
  authContext: AuthContext
}

/** Presence-only credential facts, never the value. */
export interface CredentialFacts {
  configured: boolean
  source?: string
  writable: boolean
}

/**
 * Resolve the API key for one inference call.
 *
 * Mirrors the fail-loud reference semantics of the DSH pi-ai adapter: a named
 * reference that misses throws `MISSING_CREDENTIAL` naming the route and the
 * reference, never a key fragment, and never falls back to an ambient key
 * another provider might have left in the environment.
 * @param ctx - the plugin context carrying the optional credential service.
 * @param route - the live route the credential is resolved for.
 * @param profile - the resolved profile naming the credential reference.
 * @returns the validated key for this call.
 * @throws {LlmError} code `MISSING_CREDENTIAL` when the reference is unset.
 */
export async function resolveApiKeyFor(
  ctx: Context,
  route: string,
  profile: ResolvedPiAiProviderProfile,
): Promise<string | undefined> {
  const ref = profile.apiKeyEnv
  if (ref === undefined) return undefined
  const credentials = ctx.get('credentials')
  const hit = credentials !== undefined
    ? (await credentials.resolve(ref))?.value
    : launchEnvironmentOf(ctx).get(ref)?.value
  if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, 'opencode-live', ref)
  throw new LlmError(
    `opencode-live: no credential for provider route "${route}"; its profile resolves ${ref}, which is not`
    + ' set — store it through the credentials service (the web Models page writes it) or export it'
    + ' in the launching environment',
    'MISSING_CREDENTIAL',
  )
}

/**
 * Api-key auth for a route the plugin authenticates itself.
 *
 * `Models` calls this when the request carries no `apiKey` override (for
 * example a status check): it reports the route as unconfigured rather than
 * inventing ambient credentials. The per-request key override remains the
 * only real authentication path.
 * @param name - display name used as the resolution's status label.
 * @returns the api-key auth method.
 */
export function apiKeyOnlyAuth(name: string): ApiKeyAuth {
  return {
    name,
    resolve: ({ credential }) => Promise.resolve({
      auth: credential?.key === undefined ? {} : { apiKey: credential.key },
      source: name,
    }),
  }
}

/**
 * Whether the configured reference is currently set, for status display.
 * Presence is reported without ever exposing the value.
 * @param ctx - the plugin context.
 * @param ref - the credential reference to describe.
 * @returns presence facts, or `undefined` without a credential service.
 */
export async function describeCredential(ctx: Context, ref: CredentialRef): Promise<CredentialFacts | undefined> {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return undefined
  return credentials.describe(ref)
}

/**
 * The stable auth bridge handed to `PiAiAdapter`.
 *
 * pi-ai requires both members; this plugin's routes authenticate exclusively
 * through the per-request key, so the store is inert (nothing to read, no
 * sign-in to persist) and the context never answers ambient questions. A
 * write attempt is refused loudly rather than silently dropped: a login that
 * believed it persisted would fail every later request.
 * @returns the injection for `createModels()`.
 */
export function staticAuthBridge(): PiAiAuthBridge {
  const store: CredentialStore = {
    async read() {
      return undefined
    },
    async list() {
      return []
    },
    async modify() {
      throw new LlmError(
        'opencode-live: stored credential sign-ins are not supported; its routes authenticate'
        + ' through the apiKeyEnv reference resolved by the DSH credential service',
        'NO_CREDENTIAL_STORE',
      )
    },
    async delete() {
      // Nothing is ever stored under this plugin's providers.
    },
  }
  const authContext: AuthContext = {
    // No ambient discovery: an unanswered environment question can never
    // select an unrelated provider's key.
    async env() {
      return undefined
    },
    async fileExists() {
      return false
    },
  }
  return { credentials: store, authContext }
}
