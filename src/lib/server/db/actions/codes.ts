import { db } from '$lib/server/db';
import { codes } from '$lib/server/db/schema';
import { and, desc, eq, lt } from 'drizzle-orm';
import { createHash } from 'crypto';

export type HashedCodeFilter = {
	code: string;
	email: string;
	type: string;
};

/** #162: hashed-type rows (login/signup/password-signup) carry the sha256
 *  digest of the code in `codes.code`; legacy rows keep their plaintext
 *  marker there. Mirrors the apiTokens/claimTokens pattern. */
export function hashEmailCode(code: string): string {
	return createHash('sha256').update(code).digest('hex');
}

export async function getCodes() {
	return await db.select().from(codes).orderBy(desc(codes.expiresAt));
}

export async function getCodesByEmail(email: string) {
	return await db.select().from(codes).where(eq(codes.email, email)).orderBy(desc(codes.expiresAt));
}

export async function getCode(code: string) {
	const [code1] = await db.select().from(codes).where(eq(codes.code, code));
	return code1;
}

export async function getHashedCode(filter: HashedCodeFilter) {
	const [found] = await db
		.select()
		.from(codes)
		.where(
			and(
				eq(codes.code, hashEmailCode(filter.code)),
				eq(codes.email, filter.email),
				eq(codes.type, filter.type)
			)
		);
	return found;
}

export async function deleteHashedCode(filter: HashedCodeFilter) {
	await db
		.delete(codes)
		.where(
			and(
				eq(codes.code, hashEmailCode(filter.code)),
				eq(codes.email, filter.email),
				eq(codes.type, filter.type)
			)
		);
}

export async function createCode(data: {
	code: string;
	expiresAt: Date;
	email: string;
	firstName?: string | null;
	lastName?: string | null;
	emailId?: string | null;
	type?: string | null;
	pendingEmail?: string | null;
}) {
	const [createdCode] = await db.insert(codes).values(data).returning();
	return createdCode;
}

export async function deleteCodesByEmail(email: string) {
	await db.delete(codes).where(eq(codes.email, email));
}

export async function deleteCode(code: string) {
	await db.delete(codes).where(eq(codes.code, code));
}

export async function deleteDeadCodes() {
	await db.delete(codes).where(lt(codes.expiresAt, new Date()));
}
