/**
 * identity token service: personal `fp_` API tokens — list, mint, revoke one,
 * revoke all (password reset), revoke by plaintext (mobile logout) and the
 * Bearer authentication hooks use.
 *
 * Only the SHA-256 hex of the plaintext is stored; the plaintext is answered
 * once by the mint and never selected again. Authorization (owner scoping) is
 * structural: every function takes the caller's `Actor` or the `userId` the
 * caller already proved, and the repo deletes scoped to that pair. Tokens live
 * until revoked (#169 is a separate ticket).
 *
 * Doc: ./README.md#public-interface
 */
import { randomBytes } from 'node:crypto';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { UserRow } from '$lib/kernel/db/tables.server';
import { invalid } from '$lib/kernel/errors/appError';
import { sha256Hex } from '$lib/kernel/ids/ids';
import type { ApiTokenListing, ApiTokenRecord } from './identity.contract';
import { TOKEN_ID_REQUIRED_MESSAGE, TOKEN_NAME_REQUIRED_MESSAGE } from './identity.contract';
import { API_TOKEN_BYTES, apiTokenPlaintext, isApiTokenFormat } from './identity.token.rules';
import {
	deleteApiToken,
	deleteApiTokenByHash,
	deleteApiTokensForPerson,
	findApiTokenHolder,
	insertApiToken,
	listApiTokensForPerson,
	touchApiTokenLastUsed
} from './identity.repo.server';

/** A fresh token: the plaintext (shown this once) and the safe stored record. */
export type MintedApiToken = {
	readonly token: string;
	readonly record: ApiTokenRecord;
};

/** The person's tokens, safe columns only, newest first (Q-110 B). */
export async function listApiTokens(ctx: Ctx, actor: Actor): Promise<ApiTokenListing[]> {
	return await listApiTokensForPerson(ctx.db, actor.id);
}

/**
 * Mints one token from the validated name (`ApiTokenCreateBody` has already
 * cut it at 60 code points and trimmed it — repeating that here would be the
 * same string). A blank name keeps the legacy 400 for any non-HTTP caller;
 * the plaintext is `fp_` + 32 random bytes base64url and only its SHA-256
 * reaches the database.
 */
export async function mintApiToken(
	ctx: Ctx,
	actor: Actor,
	input: { readonly name: string }
): Promise<MintedApiToken> {
	const name = input.name;
	if (!name.trim()) throw invalid(TOKEN_NAME_REQUIRED_MESSAGE);
	const token = apiTokenPlaintext(randomBytes(API_TOKEN_BYTES));
	const record = await insertApiToken(
		ctx.db,
		{ userId: actor.id, name, tokenHash: sha256Hex(token) },
		ctx.clock.now()
	);
	return { token, record };
}

/**
 * Revokes one of the caller's tokens. Owner-scoped in the query: a foreign or
 * unknown id deletes nothing and is still a success (ids cannot be probed).
 */
export async function revokeApiToken(ctx: Ctx, actor: Actor, id: string): Promise<void> {
	if (!id) throw invalid(TOKEN_ID_REQUIRED_MESSAGE);
	await deleteApiToken(ctx.db, actor.id, id);
}

/** Every token the person owns, the caller's own included (the password reset). */
export async function revokeAllApiTokens(ctx: Ctx, userId: string): Promise<number> {
	return await deleteApiTokensForPerson(ctx.db, userId);
}

/** Mobile logout: exactly the presented token, scoped to its owner. */
export async function revokeApiTokenByPlaintext(
	ctx: Ctx,
	userId: string,
	plaintext: string
): Promise<void> {
	await deleteApiTokenByHash(ctx.db, userId, sha256Hex(plaintext));
}

/**
 * Bearer authentication (`app` hooks): hash → owner, touching `lastUsedAt`.
 * Null for a non-`fp_` token, an unknown hash, or a token whose owner is gone
 * (and then nothing is touched).
 */
export async function authenticateApiToken(ctx: Ctx, token: string): Promise<UserRow | null> {
	if (!isApiTokenFormat(token)) return null;
	const holder = await findApiTokenHolder(ctx.db, sha256Hex(token));
	if (!holder) return null;
	await touchApiTokenLastUsed(ctx.db, holder.tokenId, ctx.clock.now());
	return holder.person;
}

/** The header prefix a personal API token rides on (`src/hooks.server.ts:44`). */
const BEARER_PREFIX = 'Bearer ';

/**
 * What a request's `Authorization` header resolves to, for the session
 * pipeline: `none` when there is no Bearer header at all (the cookie path
 * continues untouched), `invalid` when the token does not authenticate (the
 * caller answers 401 JSON and never resolves), `person` when it does.
 */
export type BearerResolution =
	| { readonly kind: 'none' }
	| { readonly kind: 'invalid' }
	| { readonly kind: 'person'; readonly person: UserRow };

/**
 * The Bearer half of the pipeline. It decides nothing about paths: the caller
 * only asks on `/api/*`, because page routes stay cookie-only
 * (`src/hooks.server.ts:42-62`).
 */
export async function resolveBearer(
	ctx: Ctx,
	authorization: string | null
): Promise<BearerResolution> {
	if (!authorization?.startsWith(BEARER_PREFIX)) return { kind: 'none' };
	const person = await authenticateApiToken(ctx, authorization.slice(BEARER_PREFIX.length).trim());
	return person ? { kind: 'person', person } : { kind: 'invalid' };
}

