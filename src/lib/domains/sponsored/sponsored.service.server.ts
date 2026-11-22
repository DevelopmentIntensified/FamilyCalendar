/**
 * sponsored services: one function per use case.
 *
 * The serve path is ONE call — `listSponsoredEvents` — so the gate cannot be
 * bypassed by a caller: it checks `showAdsAsEvents` through identity's settings
 * view FIRST (gate off = no ad read), resolves the month and the zone, draws
 * the month's three generated rows from the `sha256(userId + 'YYYY-MM')` seed
 * (Q-041 B; a user's own 📢 Events are not ad inventory, Q-040 B), and
 * projects every row through the one display rule (amber, `allDay`, no
 * calendar, `isAd`, `created_at` = the month's start, Q-042 B). The consent
 * services never decide anything on that path: records are evidence (the
 * settings view also carries the trail; the gate ignores it), and only a real
 * transition appends one.
 *
 * Authorization: the serve read answers for the caller only; the consent
 * functions take the person's id because identity's `AdConsentPort` hands them
 * the already-authorized saver, and this module must never invent an `Actor`
 * it cannot verify.
 *
 * Time: `listSponsoredEvents` takes the request instant as an INPUT — the
 * endpoint supplies `ctx.clock.now()`, tests pin it — so the service itself
 * stays a pure function of its parameters and `recordSponsoredConsentChange`
 * reads the same `ctx.clock.now()`. `seedSponsoredDemoAdEvents` is the one
 * non-request service: the dev seed's demo inventory (`app`'s `runDevSeed`
 * calls it), written insert-if-absent on the ctx clock.
 *
 * Doc: ./README.md#public-interface
 */
import { getCalendarSettings, type IdentityCtx } from '$lib/domains/identity/index.server';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { sha256Hex } from '$lib/kernel/ids/ids';
import type { SponsoredConsentDecision, SponsoredEvent } from './sponsored.contract';
import { sponsoredConsentDecision } from './sponsored.consent.rules';
import { toSponsoredEvent } from './sponsored.display.rules';
import {
	planSponsoredMonth,
	sponsoredDrawSeed,
	sponsoredMonthOf,
	sponsoredMonthOfKey,
	sponsoredMonthWindow,
	sponsoredSeededDraw
} from './sponsored.month.rules';
import {
	deleteAdEventsCreatedBefore,
	insertAdEventsIfAbsent,
	insertSponsoredConsentRecord,
	listSponsoredConsentRecords
} from './sponsored.repo.server';
import { shouldServeSponsoredEvents } from './sponsored.serve.rules';

/** What one serve read is asked for: a validated `YYYY-MM`, or the month of `now`. */
export type SponsoredMonthRequest = {
	/** A validated `YYYY-MM` (`SponsoredEventsQuery`); absent = the month of `now` in the user's zone. */
	readonly month?: string;
	/** The request instant: which month an absent `month` means. */
	readonly now: Date;
};

/** One entry of the consent trail as identity's `AdConsentPort` reads it. */
export type SponsoredConsentRecord = {
	readonly decision: SponsoredConsentDecision;
	readonly recordedAt: Date;
};

/**
 * The month's Sponsored Events for `actor`, as the wire and the calendar
 * render them: `[]` when the gate is off, else the month's three generated
 * rows in draw order — the sole source (owner Q-040 B; an own 📢 Event is the
 * user's own calendar data, never ad inventory).
 *
 * The gate comes from identity's settings view, which also carries the consent
 * trail; the trail is ignored (evidence, never permission) — the one serve
 * path reads it as part of that view and never decides anything with it.
 */
export async function listSponsoredEvents(
	ctx: IdentityCtx,
	actor: Actor,
	input: SponsoredMonthRequest
): Promise<SponsoredEvent[]> {
	const { settings } = await getCalendarSettings(ctx, actor);
	if (!shouldServeSponsoredEvents(settings)) return [];

	const zone = settings.timeZone ?? 'UTC';
	const month = input.month
		? sponsoredMonthOfKey(input.month)
		: sponsoredMonthOf({ now: input.now, zone });
	// Q-042 B: `created_at` is the month's start in the user's zone, so every
	// read of the same month serves the same value.
	const window = sponsoredMonthWindow({ month, zone });
	const serving = { ownerId: actor.id, createdAt: new Date(window.fromIso) };
	// Q-041 B: the draw is seeded per user and month, so the same month serves
	// the same three rows on every request.
	const random = sponsoredSeededDraw(sponsoredDrawSeed({ userId: actor.id, month }));

	return planSponsoredMonth({ month, zone, random }).map((plan) =>
		toSponsoredEvent(
			{
				id: ctx.ids.id(),
				message: plan.message,
				description: null,
				start: plan.start
			},
			serving
		)
	);
}

/**
 * Append one consent record when, and only when, the ad setting changed:
 * not-granted → `true` records `granted`, `true` → `false` records
 * `withdrawn`, and an unchanged value (or a never-touched user saving with ads
 * off) records nothing. Returns the decision, or `null` when nothing was
 * written. Identity's settings save calls this through its port.
 */
export async function recordSponsoredConsentChange(
	ctx: Ctx,
	userId: string,
	input: { readonly previous: boolean | null | undefined; readonly next: boolean }
): Promise<SponsoredConsentDecision | null> {
	const decision = sponsoredConsentDecision(input.previous, input.next);
	if (!decision) return null;
	await insertSponsoredConsentRecord(ctx.db, {
		userId,
		decision,
		recordedAt: ctx.clock.now()
	});
	return decision;
}

/**
 * The person's whole consent trail, newest first. A read never writes a record
 * — the trail is consent evidence, not a serve log.
 */
export async function listSponsoredConsentHistory(
	ctx: Ctx,
	userId: string
): Promise<SponsoredConsentRecord[]> {
	const rows = await listSponsoredConsentRecords(ctx.db, userId);
	return rows.map((row) => ({ decision: row.decision, recordedAt: row.recordedAt }));
}

/** The legacy seed's five demo templates, verbatim (`seed.ts:159-193`). */
const SPONSORED_DEMO_AD_TEMPLATES = [
	{
		sponsorName: 'Local Store',
		message: 'Summer Sale! Get 50% off',
		ctaText: 'Shop Now',
		ctaLink: 'https://example.com/sale',
		targetPlan: 'free'
	},
	{
		sponsorName: 'Family Products',
		message: 'Check out our latest family organizer',
		ctaText: 'Learn More',
		ctaLink: 'https://example.com/product',
		targetPlan: 'free'
	},
	{
		sponsorName: 'Recipe Club',
		message: 'Share your favorite family recipes',
		ctaText: 'Join',
		ctaLink: 'https://example.com/recipes',
		targetPlan: 'free'
	},
	{
		sponsorName: 'Holiday Helpers',
		message: 'Start planning your holiday events early',
		ctaText: 'Get Tips',
		ctaLink: 'https://example.com/holidays',
		targetPlan: 'free'
	},
	{
		sponsorName: 'School Tools',
		message: 'Organize your school schedules',
		ctaText: 'Sign Up',
		ctaLink: 'https://example.com/school',
		targetPlan: 'free'
	}
] as const;

const SPONSORED_DEMO_AD_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Write the legacy dev seed's five demo ad rows, keyed `test-ad-1` …
 * `test-ad-5`: insert-if-absent, so a second seed writes nothing (the legacy
 * `.onConflictDoNothing()`). Scheduling is the legacy maths against the ctx
 * clock (`seed.ts:196-198`): row `i` starts `(i - 2)` weeks from `now` and
 * expires 30 days after it starts.
 *
 * The legacy seed drew `impressions`/`clicks` at random; v2 derives them from
 * the row id through the module's seeded draw (the Q-041 precedent), so one
 * database gets one stable set and R5's global-random ban holds. The legacy
 * seed wrote no ads while the `users` table was empty; that gate is gone — the
 * demo rows reference no user, and reading identity's table here would be an
 * undeclared foreign read (see sheet › Notes).
 *
 * `app`'s `runDevSeed` is the only caller; answers how many rows were new.
 */
export async function seedSponsoredDemoAdEvents(ctx: Ctx): Promise<number> {
	const now = ctx.clock.now();
	const rows = SPONSORED_DEMO_AD_TEMPLATES.map((template, index) => {
		const scheduledFor = new Date(now.getTime() + (index - 2) * 7 * SPONSORED_DEMO_AD_DAY_MS);
		const expiresAt = new Date(scheduledFor.getTime() + 30 * SPONSORED_DEMO_AD_DAY_MS);
		const random = sponsoredSeededDraw(sha256Hex(`sponsored-demo-ad:${index + 1}`));
		return {
			id: `test-ad-${index + 1}`,
			...template,
			scheduledFor,
			expiresAt,
			impressions: Math.floor(random() * 100) + 10,
			clicks: Math.floor(random() * 10),
			conversions: 0
		};
	});
	return await insertAdEventsIfAbsent(ctx.db, rows);
}

/**
 * Retention: delete the `adEvents` rows created before `cutoff` and return how
 * many went. `app`'s weekly cleanup cron computes the 90-day cutoff and passes
 * it, so the anchor rule lives here and the schedule lives there.
 */
export async function pruneSponsoredEventsOlderThan(ctx: Ctx, cutoff: Date): Promise<number> {
	return await deleteAdEventsCreatedBefore(ctx.db, cutoff);
}
