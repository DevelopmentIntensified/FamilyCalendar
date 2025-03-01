import { db } from '$lib/server/db';
import { codes, type Code } from '$lib/server/db/schema';
import { desc, eq, lt } from 'drizzle-orm';

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

export async function createCode(data: Omit<Code, 'id'>) {
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
