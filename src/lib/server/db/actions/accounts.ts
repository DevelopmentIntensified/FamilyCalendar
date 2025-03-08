import { db } from '$lib/server/db';
import { accounts, type Account } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function getAccounts() {
	return await db.select().from(accounts);
}

export async function getAccount(id: string): Promise<Account> {
	const [account] = await db.select().from(accounts).where(eq(accounts.providerAccountId, id));
	return account;
}

export async function createAccount(
	data: Omit<Omit<Omit<Omit<Account, 'id'>, 'createdAt'>, 'updatedAt'>, 'lastLogin'>
) {
	const [createdAccount] = await db.insert(accounts).values(data).returning();
	return createdAccount;
}

export async function updateAccount(id: string, data: Partial<Omit<Account, 'id'>>) {
	const [updatedAccount] = await db
		.update(accounts)
		.set(data)
		.where(eq(accounts.providerAccountId, id))
		.returning();
	return updatedAccount;
}

export async function deleteAccount(id: string) {
	await db.delete(accounts).where(eq(accounts.providerAccountId, id));
}
