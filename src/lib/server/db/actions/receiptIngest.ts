import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

/**
 * Receipt email ingest identity (#033). Each user may get a personal
 * ingest address — `receipts.<token>@<RECEIPT_INGEST_DOMAIN>` — whose ONLY
 * property is routing an inbound email to that user. The token is 32 hex
 * chars (128 bits), stored on the user row, unique when set.
 */

/** Length of the token in characters (32 hex = 128 bits of entropy). */
export const INGEST_TOKEN_LENGTH = 32;

/** True when a candidate token is well-formed for lookup. */
export function isValidIngestToken(token: string): boolean {
	return /^[0-9a-f]{32}$/.test(token);
}

/** A fresh 32-char hex ingest token. */
export function generateIngestToken(): string {
	return randomBytes(16).toString('hex');
}

/** The user's ingest token, creating one on first use. */
export async function getOrCreateIngestToken(userId: string): Promise<string> {
	const [row] = await db
		.select({ receiptIngestToken: users.receiptIngestToken })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (row?.receiptIngestToken) return row.receiptIngestToken;
	const token = generateIngestToken();
	const [updated] = await db
		.update(users)
		.set({ receiptIngestToken: token })
		.where(eq(users.id, userId))
		.returning({ receiptIngestToken: users.receiptIngestToken });
	return updated?.receiptIngestToken ?? token;
}

/** Replaces the user's ingest token (old address stops working). */
export async function regenerateIngestToken(userId: string): Promise<string> {
	const token = generateIngestToken();
	const [updated] = await db
		.update(users)
		.set({ receiptIngestToken: token })
		.where(eq(users.id, userId))
		.returning({ receiptIngestToken: users.receiptIngestToken });
	if (!updated?.receiptIngestToken) throw new Error('Failed to regenerate ingest token');
	return updated.receiptIngestToken;
}

/** The user id owning an ingest token, or null when none matches. */
export async function findUserIdByIngestToken(token: string): Promise<string | null> {
	if (!isValidIngestToken(token)) return null;
	const [row] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.receiptIngestToken, token))
		.limit(1);
	return row?.id ?? null;
}

/**
 * The full ingest address for a token
 * (`receipts.<token>@<RECEIPT_INGEST_DOMAIN>`), or null when the feature
 * is off (env unset). Lives here so the route file only exports handlers.
 */
export function ingestAddress(token: string): string | null {
	const domain = process.env.RECEIPT_INGEST_DOMAIN;
	if (!domain) return null;
	return `receipts.${token}@${domain}`;
}
