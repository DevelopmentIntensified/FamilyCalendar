import { db } from '$lib/server/db';
import { userAdConsent } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export class AdConsentRepository {
	async hasConsent(userId: string): Promise<boolean> {
		const [consent] = await db
			.select()
			.from(userAdConsent)
			.where(eq(userAdConsent.userId, userId));
		return !!consent;
	}

	async grantConsent(userId: string): Promise<void> {
		const existing = await db
			.select()
			.from(userAdConsent)
			.where(eq(userAdConsent.userId, userId));

		if (existing.length > 0) return;

		await db.insert(userAdConsent).values({ userId });
	}

	async getRecord(userId: string): Promise<{ userId: string } | null> {
		const [consent] = await db
			.select()
			.from(userAdConsent)
			.where(eq(userAdConsent.userId, userId));
		return consent ?? null;
	}
}
