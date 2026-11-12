// Page-harness data: one seed per page shape, written straight into the pages
// database with plain drizzle inserts (never through a legacy service).
//
// A seed returns the identity the page needs (`email` for the session cookie)
// plus any params a dynamic route template wants (`[id]`, `[familyId]`,
// `[code]`, or the `[token]` of a link-borne credential).
//
// Identity is FIXED per seed, not random per run: the account rail, the family
// roster and every avatar colour hash the user id (kernel/ui colourHash), so a
// random id or address changes the pixels and the committed baseline could
// never match on the next run. "Fresh" comes from deleting the seed's previous
// rows before inserting: every run starts from the same, clean state.
//
// Doc: e2e/pages/README.md
import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { createJWT } from 'oslo/jwt';
import { TimeSpan } from 'oslo';
import { connectDb, type Db } from '$lib/kernel/db/database.server';
import {
	bugReports,
	calendars,
	events,
	families,
	familyInviteCodes,
	familyMembers,
	groceryItems,
	groceryStoreColours,
	notifications,
	taskCompletions,
	tasks,
	unmatchedPhrases,
	userSettings,
	users
} from '$lib/kernel/db/tables.server';
import { ANONYMOUS_EMAIL_DOMAIN } from '$lib/utils/anonymous';
import { normalizeGroceryName } from '$lib/data/groceries';

/** The zone every seed's dates are expressed in (and the user's settings zone). */
const ZONE = 'America/New_York';

/** Fixed names: they render in the account rail, the roster and the calendar. */
const FIRST_NAME = 'Rosa';
const LAST_NAME = 'Alvarez';

/**
 * The `EMAILSECRET` that `npm run build:safe` (what `npm run pages:build`
 * runs) bakes into `$env/static/private`. The invite-email page validates its
 * token against that build-baked value, so the seed must sign with the same
 * placeholder — it is a placeholder, not a secret.
 */
const BUILD_TIME_EMAIL_SECRET = 'local-build-placeholder-not-a-secret';

export type SeedCookie = { name: string; value: string };

export type SeedResult = {
	/** Signed-in user's address; absent for a page a signed-out visitor sees. */
	email?: string;
	/** Fill-ins for the route template: `[id]`, `[familyId]`, `[code]`, `[token]`. */
	params?: Record<string, string>;
	/** Extra cookies the page itself reads (the guest-merge stash). */
	cookies?: SeedCookie[];
};

type SeedContext = { db: Db; now: DateTime; seed: string };

/** Stable row id: 15 hex chars, derived from the seed-relative name. */
function pageId(name: string): string {
	return createHash('sha256').update(`family-planz:pages:${name}`).digest('hex').slice(0, 15);
}

/** Stable address per seed (see the header note on why it is not random). */
function address(seed: string, suffix = 'user'): string {
	return `visual+${seed}-${suffix}@example.invalid`;
}

/** ISO timestamp in the user's zone: `days` from today at `hour:minute`. */
function at(now: DateTime, days: number, hour: number, minute = 0): string {
	const value = now
		.plus({ days })
		.set({ hour, minute, second: 0, millisecond: 0 })
		.toISO({ suppressMilliseconds: true });
	if (!value) throw new RangeError(`seed date is invalid (${now.invalidReason ?? 'unknown'})`);
	return value;
}

/** ISO timestamp for a whole instant `days` before now. */
function ago(now: DateTime, days: number): string {
	const value = now.minus({ days }).toISO({ suppressMilliseconds: true });
	if (!value) throw new RangeError(`seed date is invalid (${now.invalidReason ?? 'unknown'})`);
	return value;
}

type NewUserOptions = {
	suffix?: string;
	admin?: boolean;
	anonymous?: boolean;
	/** Roster members get their own visible name. */
	name?: { first: string; last: string };
	/** Store no address at all (nothing on the page prints it). */
	withoutEmail?: boolean;
};

async function insertUser(ctx: SeedContext, options: NewUserOptions = {}) {
	const suffix = options.suffix ?? 'user';
	const id = pageId(`${ctx.seed}:${suffix}`);
	const email = options.anonymous
		? `${id}${ANONYMOUS_EMAIL_DOMAIN}`
		: options.withoutEmail
			? null
			: address(ctx.seed, suffix);

	// Fresh per run: the previous rows (and everything that cascades from them)
	// go first, so a repeat run starts from one user, not two.
	await ctx.db.delete(users).where(eq(users.id, id));

	const [row] = await ctx.db
		.insert(users)
		.values({
			id,
			firstName: options.name?.first ?? (options.anonymous ? 'Guest' : FIRST_NAME),
			lastName: options.name?.last ?? (options.anonymous ? '' : LAST_NAME),
			email,
			emailVerified: !options.anonymous,
			roles: options.admin ? ['admin'] : []
		})
		.returning();

	await ctx.db.insert(userSettings).values({
		id: pageId(`${ctx.seed}:${suffix}:settings`),
		userId: id,
		timeZone: ZONE,
		weekStart: 'sunday',
		// The month grid is the stable view: no now-line, no hour auto-scroll.
		defaultView: 'monthView'
	});

	return row;
}

async function insertPersonalCalendar(ctx: SeedContext, userId: string, suffix = 'user') {
	const id = pageId(`${ctx.seed}:${suffix}:calendar`);
	await ctx.db.delete(calendars).where(eq(calendars.id, id));
	await ctx.db.insert(calendars).values({ id, ownerId: userId });
	return id;
}

/** One signed-in user with a personal calendar: the smallest useful account. */
async function seedPersonalAccount(ctx: SeedContext, options: NewUserOptions = {}) {
	const user = await insertUser(ctx, options);
	const calendarId = await insertPersonalCalendar(ctx, user.id, options.suffix);
	return { user, calendarId };
}

type EventSeed = {
	key: string;
	title: string;
	description: string | null;
	location: string | null;
	start: string;
	end: string;
	allDay: boolean;
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
	recurrenceCount?: number | null;
};

/** Events a calendar-ish page can show: today, tomorrow, all-day, next week. */
async function insertCalendarEvents(ctx: SeedContext, userId: string, calendarId: string) {
	const eventsToShow: EventSeed[] = [
		{
			key: 'school',
			title: 'School run',
			description: 'Drop-off and the morning handover.',
			location: 'Lincoln Elementary',
			start: at(ctx.now, 0, 9),
			end: at(ctx.now, 0, 10),
			allDay: false
		},
		{
			key: 'birthday',
			title: "Grandma's birthday",
			description: null,
			location: null,
			start: at(ctx.now, 0, 0),
			end: at(ctx.now, 1, 0),
			allDay: true
		},
		{
			key: 'dinner',
			title: 'Family dinner',
			description: 'Everyone at the big table.',
			location: 'Home',
			start: at(ctx.now, 1, 18),
			end: at(ctx.now, 1, 20),
			allDay: false
		},
		{
			// Recurring: the month grid, the print sheet and the stats page all
			// read the expansion, not just the base row.
			key: 'soccer',
			title: 'Soccer practice',
			description: null,
			location: 'Riverside Field',
			start: at(ctx.now, 3, 16),
			end: at(ctx.now, 3, 17),
			allDay: false,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceCount: 4
		}
	];

	// Every row carries every key, in one order: drizzle builds the INSERT's
	// column list from the values it is handed, so a row that omits a column
	// would shift the rest.
	const rows = eventsToShow.map((event) => ({
		id: pageId(`${ctx.seed}:event:${event.key}`),
		calendarId,
		ownerId: userId,
		title: event.title,
		description: event.description,
		location: event.location,
		start: event.start,
		end: event.end,
		allDay: event.allDay,
		recurrenceFrequency: event.recurrenceFrequency ?? null,
		recurrenceInterval: event.recurrenceInterval ?? null,
		recurrenceCount: event.recurrenceCount ?? null
	}));

	await ctx.db.delete(events).where(eq(events.id, rows[0].id));
	await ctx.db.insert(events).values(rows);
	return rows[0].id;
}

async function insertTasks(ctx: SeedContext, userId: string) {
	const rows = [
		{
			id: pageId(`${ctx.seed}:task:recycling`),
			title: 'Take out the recycling',
			notes: 'Blue bin, before 7am.',
			dueDate: at(ctx.now, 0, 7),
			completedAt: null,
			archivedAt: null,
			priority: 'high',
			category: 'Home',
			completionCount: 0,
			userId
		},
		{
			id: pageId(`${ctx.seed}:task:plants`),
			title: 'Water the plants',
			notes: null,
			dueDate: at(ctx.now, 1, 8),
			completedAt: null,
			archivedAt: null,
			priority: 'normal',
			category: 'Home',
			completionCount: 0,
			userId
		},
		{
			id: pageId(`${ctx.seed}:task:dentist`),
			title: 'Book the dentist',
			notes: null,
			dueDate: at(ctx.now, -1, 9),
			completedAt: ago(ctx.now, 1),
			archivedAt: null,
			priority: 'low',
			category: null,
			completionCount: 1,
			userId
		},
		{
			// Old enough to fill the archive's retention gate.
			id: pageId(`${ctx.seed}:task:passports`),
			title: 'Renew the passports',
			notes: null,
			dueDate: at(ctx.now, -46, 9),
			completedAt: ago(ctx.now, 46),
			archivedAt: ago(ctx.now, 45),
			priority: 'normal',
			category: null,
			completionCount: 1,
			userId
		}
	];
	await ctx.db.delete(tasks).where(eq(tasks.id, rows[0].id));
	await ctx.db.insert(tasks).values(rows);

	// Completion history: the streak hero and the recent-completions list.
	await ctx.db.delete(taskCompletions).where(eq(taskCompletions.id, pageId(`${ctx.seed}:done:1`)));
	await ctx.db.insert(taskCompletions).values([
		{
			id: pageId(`${ctx.seed}:done:1`),
			taskId: rows[2].id,
			userId,
			completedAt: ago(ctx.now, 1)
		},
		{
			id: pageId(`${ctx.seed}:done:2`),
			taskId: rows[3].id,
			userId,
			completedAt: ago(ctx.now, 45)
		}
	]);

	return rows[0].id;
}

async function insertNotifications(ctx: SeedContext, userId: string) {
	await ctx.db
		.delete(notifications)
		.where(eq(notifications.id, pageId(`${ctx.seed}:notification:1`)));
	await ctx.db.insert(notifications).values([
		{
			id: pageId(`${ctx.seed}:notification:1`),
			userId,
			type: 'added_to_family',
			actorName: 'Ana Alvarez',
			message: 'Ana added you to The Alvarez Family.',
			link: '/family',
			readAt: null,
			// Days in the past keep the relative label ("2 days ago") stable for
			// the whole day the baseline is taken on.
			createdAt: ago(ctx.now, 2)
		},
		{
			id: pageId(`${ctx.seed}:notification:2`),
			userId,
			type: 'task_completed',
			actorName: 'Leo Alvarez',
			message: 'Leo completed "Water the plants".',
			link: '/calendar/tasks',
			readAt: ago(ctx.now, 1),
			createdAt: ago(ctx.now, 3)
		}
	]);
}

type NewFamilyOptions = {
	name?: string;
	color?: string;
};

async function insertFamily(ctx: SeedContext, options: NewFamilyOptions = {}) {
	const id = pageId(`${ctx.seed}:family`);
	await ctx.db.delete(families).where(eq(families.id, id));
	const [row] = await ctx.db
		.insert(families)
		.values({
			id,
			name: options.name ?? 'The Alvarez Family',
			color: options.color ?? '#6366f1'
		})
		.returning();
	return row;
}

/** A valid, unexpired invite code for the family. */
async function insertInviteCode(ctx: SeedContext, familyId: string, createdBy: string | null) {
	const code = 'VISUALFAMILY01';
	await ctx.db.delete(familyInviteCodes).where(eq(familyInviteCodes.code, code));
	await ctx.db.insert(familyInviteCodes).values({
		code,
		familyId,
		expiresAt: new Date(ctx.now.plus({ days: 30 }).toMillis()),
		maxUses: 5,
		useCount: 0,
		createdBy
	});
	return code;
}

// --- seeds ----------------------------------------------------------------

/** Public marketing and auth pages: no user, no rows. */
async function publicPages(): Promise<SeedResult> {
	return {};
}

/** The (admin) group: an admin, open bug reports and open unmatched phrases. */
async function adminRegisters(ctx: SeedContext): Promise<SeedResult> {
	const user = await insertUser(ctx, { admin: true });

	await ctx.db.delete(bugReports).where(eq(bugReports.id, pageId(`${ctx.seed}:bug:1`)));
	await ctx.db.insert(bugReports).values([
		{
			id: pageId(`${ctx.seed}:bug:1`),
			userId: user.id,
			area: 'calendar',
			description: 'Dragging an event to next week moved it a day early.',
			url: '/calendar',
			status: 'open'
		},
		{
			id: pageId(`${ctx.seed}:bug:2`),
			userId: null,
			area: 'tasks',
			description: 'The clear-completed button did nothing on the phone.',
			url: '/calendar/tasks',
			status: 'open'
		}
	]);

	await ctx.db
		.delete(unmatchedPhrases)
		.where(eq(unmatchedPhrases.id, pageId(`${ctx.seed}:phrase:1`)));
	await ctx.db.insert(unmatchedPhrases).values([
		{
			id: pageId(`${ctx.seed}:phrase:1`),
			source: 'event_parse',
			phrase: 'dentist next tuesday at noonish',
			sample: 'Dentist next Tuesday at noonish',
			matched: JSON.stringify({ title: 'Dentist' }),
			count: 4,
			resolved: false
		},
		{
			id: pageId(`${ctx.seed}:phrase:2`),
			source: 'bulk_edit',
			phrase: 'push everything at the weekend back an hour',
			sample: 'Push everything at the weekend back an hour',
			matched: null,
			count: 2,
			resolved: false
		}
	]);

	return { email: user.email ?? undefined };
}

/** A plain signed-in account with a personal calendar and nothing else. */
async function accountUser(ctx: SeedContext): Promise<SeedResult> {
	const { user } = await seedPersonalAccount(ctx);
	return { email: user.email ?? undefined };
}

/** The calendar pages: a personal calendar, events, tasks, completions, alerts. */
async function calendarUser(ctx: SeedContext): Promise<SeedResult> {
	const { user, calendarId } = await seedPersonalAccount(ctx);
	const eventId = await insertCalendarEvents(ctx, user.id, calendarId);
	await insertTasks(ctx, user.id);
	await insertNotifications(ctx, user.id);
	return { email: user.email ?? undefined, params: { id: eventId } };
}

/** Groceries: two stores, five open items, one already checked off. */
async function groceriesUser(ctx: SeedContext): Promise<SeedResult> {
	const { user } = await seedPersonalAccount(ctx);
	const traderJoes = "Trader Joe's";
	const wholeFoods = 'Whole Foods Market';

	// Distinct `createdAt` per row and a fixed insert order: the list reads
	// `order by created_at`, and rows inserted in one statement would otherwise
	// share a timestamp and tie — the order (and the screenshot) could move.
	const rows = [
		{ name: 'Whole milk', stores: [traderJoes], quantity: 2, checkedAt: null, minutesAgo: 50 },
		{
			name: 'Free-range eggs',
			stores: [traderJoes],
			quantity: 1,
			checkedAt: null,
			minutesAgo: 40
		},
		{
			name: 'Sourdough loaf',
			stores: [wholeFoods],
			quantity: 1,
			checkedAt: null,
			minutesAgo: 30
		},
		{
			name: 'Coffee beans',
			stores: [wholeFoods],
			quantity: 1,
			checkedAt: null,
			minutesAgo: 20
		},
		{
			name: 'Bananas',
			stores: [traderJoes],
			quantity: 6,
			checkedAt: ago(ctx.now, 0),
			minutesAgo: 10
		}
	].map((row) => ({
		id: pageId(`${ctx.seed}:grocery:${row.name}`),
		userId: user.id,
		familyId: null,
		name: row.name,
		nameKey: normalizeGroceryName(row.name),
		quantity: row.quantity,
		stores: row.stores,
		checkedAt: row.checkedAt,
		createdAt: ctx.now.minus({ minutes: row.minutesAgo }).toJSDate()
	}));

	await ctx.db.delete(groceryItems).where(eq(groceryItems.id, rows[0].id));
	await ctx.db.insert(groceryItems).values(rows);

	await ctx.db
		.delete(groceryStoreColours)
		.where(eq(groceryStoreColours.id, pageId(`${ctx.seed}:colour:trader-joes`)));
	await ctx.db.insert(groceryStoreColours).values([
		{
			id: pageId(`${ctx.seed}:colour:trader-joes`),
			userId: user.id,
			familyId: null,
			storeKey: normalizeGroceryName(traderJoes),
			color: 'terracotta'
		},
		{
			id: pageId(`${ctx.seed}:colour:whole-foods`),
			userId: user.id,
			familyId: null,
			storeKey: normalizeGroceryName(wholeFoods),
			color: 'sage'
		}
	]);

	return { email: user.email ?? undefined };
}

/** The family group: creator membership, a roster, an invite code, family tasks. */
async function familyUser(ctx: SeedContext): Promise<SeedResult> {
	const { user } = await seedPersonalAccount(ctx);
	const family = await insertFamily(ctx);

	// A second adult and a child, so the roster is not a single row. Their
	// addresses are left empty: the roster prints a member's address under the
	// name and every address is a per-seed constant anyway.
	const roster = [
		{
			suffix: 'parent',
			name: { first: 'Ana', last: LAST_NAME },
			role: 'admin',
			memberType: 'parent'
		},
		{
			suffix: 'child',
			name: { first: 'Leo', last: LAST_NAME },
			role: 'member',
			memberType: 'child'
		}
	] as const;
	for (const member of roster) {
		const row = await insertUser(ctx, {
			suffix: member.suffix,
			name: member.name,
			withoutEmail: true
		});
		await ctx.db.insert(familyMembers).values({
			userId: row.id,
			familyId: family.id,
			role: member.role,
			memberType: member.memberType
		});
	}

	await ctx.db.insert(familyMembers).values({
		userId: user.id,
		familyId: family.id,
		role: 'creator',
		memberType: 'parent'
	});

	const code = await insertInviteCode(ctx, family.id, user.id);

	// Shared family calendar + a family event and two board tasks.
	const familyCalendarId = pageId(`${ctx.seed}:family-calendar`);
	await ctx.db.delete(calendars).where(eq(calendars.id, familyCalendarId));
	await ctx.db
		.insert(calendars)
		.values({ id: familyCalendarId, ownerId: user.id, familyId: family.id });

	await ctx.db.insert(events).values({
		id: pageId(`${ctx.seed}:event:family-dinner`),
		calendarId: familyCalendarId,
		ownerId: user.id,
		title: 'Sunday roast',
		description: null,
		location: 'Home',
		start: at(ctx.now, 2, 17),
		end: at(ctx.now, 2, 19),
		allDay: false
	});

	await ctx.db.insert(tasks).values([
		{
			id: pageId(`${ctx.seed}:task:family-hoover`),
			title: 'Hoover the stairs',
			notes: null,
			dueDate: at(ctx.now, 0, 18),
			completedAt: null,
			archivedAt: null,
			priority: 'normal',
			category: 'Home',
			completionCount: 0,
			userId: user.id,
			familyId: family.id
		},
		{
			id: pageId(`${ctx.seed}:task:family-bins`),
			title: 'Put the bins out',
			notes: null,
			dueDate: at(ctx.now, 1, 7),
			completedAt: null,
			archivedAt: null,
			priority: 'high',
			category: 'Home',
			completionCount: 0,
			userId: user.id,
			familyId: family.id
		}
	]);

	return {
		email: user.email ?? undefined,
		params: { familyId: family.id, code }
	};
}

/** A public invite link: the family and its code exist, no visitor does. */
async function familyInvite(ctx: SeedContext): Promise<SeedResult> {
	const family = await insertFamily(ctx, { name: 'The Rivera Family', color: '#0f766e' });
	const code = await insertInviteCode(ctx, family.id, null);
	return { params: { code } };
}

/** A guest (anonymous account) — the /claim page's audience. */
async function guestUser(ctx: SeedContext): Promise<SeedResult> {
	const user = await insertUser(ctx, { anonymous: true });
	return { email: user.email ?? undefined };
}

/**
 * The guest-merge prompt: a signed-in account plus a claimable guest whose id
 * lives in the guest-merge stash cookie the page reads.
 */
async function mergeGuestUser(ctx: SeedContext): Promise<SeedResult> {
	const { user } = await seedPersonalAccount(ctx);
	const guest = await insertUser(ctx, { suffix: 'guest', anonymous: true });
	await ctx.db.insert(events).values({
		id: pageId(`${ctx.seed}:event:guest`),
		calendarId: null,
		ownerId: guest.id,
		title: 'Guest appointment',
		description: null,
		location: null,
		start: at(ctx.now, 1, 11),
		end: at(ctx.now, 1, 12),
		allDay: false
	});
	return {
		email: user.email ?? undefined,
		cookies: [{ name: 'guest_merge', value: guest.id }]
	};
}

/**
 * The invited-by-email page. Its only input is a signed JWT in the query, so
 * the seed mints one with the same placeholder secret the build baked in.
 */
async function inviteEmail(ctx: SeedContext): Promise<SeedResult> {
	const token = await createJWT(
		'HS256',
		new TextEncoder().encode(BUILD_TIME_EMAIL_SECRET),
		{
			email: address(ctx.seed, 'invitee'),
			firstName: 'Ines',
			lastName: LAST_NAME,
			familyId: pageId(`${ctx.seed}:family`)
		},
		{ headers: { alg: 'HS256', typ: 'JWT' }, expiresIn: new TimeSpan(15, 'm') }
	);
	return { params: { token } };
}

export const seeds = {
	publicPages,
	adminRegisters,
	accountUser,
	calendarUser,
	groceriesUser,
	familyUser,
	familyInvite,
	guestUser,
	mergeGuestUser,
	inviteEmail
} satisfies Record<string, (ctx: SeedContext) => Promise<SeedResult>>;

export type SeedName = keyof typeof seeds;

/** Run one seed against the pages database and close the pool. */
export async function runSeed(name: SeedName): Promise<SeedResult> {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not set — run through playwright.pages.config.ts.');

	const handle = connectDb(url, 2);
	try {
		const ctx: SeedContext = { db: handle.db, now: DateTime.now().setZone(ZONE), seed: name };
		return await seeds[name](ctx);
	} finally {
		await handle.close();
	}
}
