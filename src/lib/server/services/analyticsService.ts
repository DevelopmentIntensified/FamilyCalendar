import { db } from '$lib/server/db';
import { subscriptions, userSettings } from '$lib/server/db/schema';
import { eq, and, gte, asc, sql } from 'drizzle-orm';

export interface KPIStats {
	totalUsers: number;
	activeSubscriptions: number;
	freeUsers: number;
	paidUsers: number;
	waitlistSignups: number;
	adConsentEnabled: number;
	adConsentDisabled: number;
}

export async function getKPIMetrics(): Promise<KPIStats> {
	const [totalUsers] = await db.select({ count: sql`count(*)` }).from(userSettings);
	const [activeSubs] = await db.select({ count: sql`count(*)` }).from(subscriptions).where(eq(subscriptions.status, 'active'));
	const [paidSubs] = await db.select({ count: sql`count(*)` }).from(subscriptions).where(and(eq(subscriptions.status, 'active'), sql`${subscriptions.subscriptionTypeId} IS NOT NULL`));
	
	return {
		totalUsers: Number(totalUsers?.count || 0),
		activeSubscriptions: Number(activeSubs?.count || 0),
		freeUsers: Number(totalUsers?.count || 0) - Number(paidSubs?.count || 0),
		paidUsers: Number(paidSubs?.count || 0),
		waitlistSignups: 0,
		adConsentEnabled: 0,
		adConsentDisabled: 0
	};
}

export async function trackPricingView(userId: string, planType: string): Promise<void> {
	console.log(`[KPI] Pricing view: user=${userId}, plan=${planType}`);
}

export async function trackCheckoutStart(userId: string, planType: string): Promise<void> {
	console.log(`[KPI] Checkout start: user=${userId}, plan=${planType}`);
}

export async function trackSubscriptionUpgrade(userId: string, planType: string): Promise<void> {
	console.log(`[KPI] Subscription upgrade: user=${userId}, plan=${planType}`);
}

export async function trackWaitlistSignup(email: string): Promise<void> {
	console.log(`[KPI] Waitlist signup: email=${email}`);
}

export async function trackAdConsentChange(userId: string, enabled: boolean): Promise<void> {
	console.log(`[KPI] Ad consent: user=${userId}, enabled=${enabled}`);
}