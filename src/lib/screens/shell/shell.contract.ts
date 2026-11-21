/**
 * shell contract: the two layout models the browser receives and the narrow
 * ports the chrome's state classes take. This is not a `/api` wire — shell
 * owns no `/api` route — so the models carry real `Date`s (SvelteKit's devalue
 * keeps them), unlike the ISO strings of the domain contracts.
 *
 * Both models are strict whitelists. The legacy layouts serialise the whole
 * `users` row — `passwordHash`, `receiptIngestToken` and `phonenumber`
 * included (`(calendar)/calendar/+layout.server.ts:17`,
 * `(family)/+layout.server.ts:12`, hotfix #324) — so a field reaches the
 * browser only by being listed here, and a test that parses a raw user row
 * fails instead of shipping a credential.
 *
 * `isAnonymous` is deliberately absent: identity owns that predicate
 * (`isAnonymousAccount`), and shell receives it as an input where a rule
 * needs it. The same goes for every settings rule — this file only declares
 * the shape shell hands on.
 *
 * Doc: ./README.md#invariants
 */
import { z } from '$lib/kernel/validation/validators';

// --- Layout models ----------------------------------------------------------

/**
 * The only user fields the chrome and the calendar group may serialise: id,
 * names, email, admin flag, verification and the Inactivity Window input.
 * `isAdmin` is derived from `users.roles` by the session pipeline
 * (`kernel/ctx/actor.ts`), never read from the row here.
 */
export const ShellUserSummary = z.strictObject({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().nullable(),
	isAdmin: z.boolean(),
	emailVerified: z.boolean().nullable(),
	/**
	 * The Inactivity Window input. Nullable because the column is: the legacy
	 * layout read `user?.lastActiveAt` and answered 90 days when it was absent
	 * (`(calendar)/calendar/+layout.svelte:51-58`).
	 */
	lastActiveAt: z.date().nullable()
});
export type ShellUserSummary = z.infer<typeof ShellUserSummary>;

/**
 * The settings fields the calendar group's pages read through `parent()`
 * (`userSettings?.timeZone`, `.defaultView`, `.weekStart`, `.color`,
 * `.defaultCalendarId`, `.hiddenDashboardModules`, `.showAdsAsEvents` and the
 * dashboard feature gates). `verseTranslation`, `useCloudAI`/`useLocalAI` and
 * the row plumbing stay with identity, which owns their consumers.
 */
export const ShellSettingsModel = z.strictObject({
	weekStart: z.string().nullable(),
	timeZone: z.string().nullable(),
	color: z.string().nullable(),
	defaultView: z.string().nullable(),
	defaultCalendarId: z.string().nullable(),
	syncEventsToFamilyCalendar: z.boolean().nullable(),
	showAdsAsEvents: z.boolean().nullable(),
	autoParseEventDetails: z.boolean().nullable(),
	showDailyVerse: z.boolean().nullable(),
	hiddenDashboardModules: z.array(z.string()).nullable()
});
export type ShellSettingsModel = z.infer<typeof ShellSettingsModel>;

/**
 * One roster row as family's canonical read returns it (`family.contract.ts`
 * `RosterMemberResponse`, legacy `getFamilyRoster`). A guest's placeholder
 * email is never shown; the UI applies identity's `guestSafeEmail`.
 */
export const ShellRosterMember = z.strictObject({
	userId: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().nullable(),
	role: z.string().nullable(),
	memberType: z.string().nullable()
});
export type ShellRosterMember = z.infer<typeof ShellRosterMember>;

/** The root layout's data: the summary (or no session) plus the server year. */
export const ShellRootModel = z.strictObject({
	user: ShellUserSummary.nullable(),
	/** The footer's © year, from `ctx.clock.now()` — never `new Date()` in the component. */
	year: z.number().int()
});
export type ShellRootModel = z.infer<typeof ShellRootModel>;

/**
 * The fields the group frame reads from whichever layout model hosts it: the
 * calendar scope narrows to this shape (its `settings.timeZone` gates the
 * probe), and the family frame gets the root summary, which carries no scope.
 */
export type ShellFrameScope = {
	readonly user: ShellUserSummary;
	/** The footer's © year, from the root load (`ctx.clock.now()`). */
	readonly year: number;
	/** Days left in the 90-day Inactivity Window (calendar only). */
	readonly daysLeft?: number;
	/** The stored zone the once-per-user probe's gate reads (calendar only). */
	readonly settings?: { readonly timeZone: string | null } | null;
};

/**
 * The calendar group's shared scope (#041): the root summary passed through
 * `event.parent()` (no second query), identity's settings, family's id and
 * roster, and the Anonymous Account countdown. A failed family read degrades
 * to `null`/`[]`. No `pathname` — reading `url` in a load re-runs it on every
 * navigation, which is the legacy bug this model exists to prevent.
 */
export const ShellScopeModel = z.strictObject({
	/** The root summary, flattened: a signed-in group always has a user. */
	user: ShellUserSummary,
	year: z.number().int(),
	settings: ShellSettingsModel.nullable(),
	familyId: z.string().nullable(),
	roster: z.array(ShellRosterMember),
	/** `shellDaysLeft(user.lastActiveAt, now)`: 90 when the row has no timestamp. */
	daysLeft: z.number().int().min(0)
});
export type ShellScopeModel = z.infer<typeof ShellScopeModel>;

/**
 * The one top notice, decided by `shellNoticeFor`. A discriminated union so
 * the UI cannot render a merge without its counts or a countdown without its
 * urgency. Only the anonymous countdown is not dismissible.
 */
export const ShellNoticeModel = z.discriminatedUnion('kind', [
	z.strictObject({ kind: z.literal('claimed'), dismissible: z.literal(true) }),
	z.strictObject({ kind: z.literal('verify'), dismissible: z.literal(true) }),
	z.strictObject({
		kind: z.literal('merged'),
		dismissible: z.literal(true),
		events: z.number().int().min(0),
		tasks: z.number().int().min(0)
	}),
	z.strictObject({
		kind: z.literal('anonymous'),
		dismissible: z.literal(false),
		urgent: z.boolean(),
		daysLeft: z.number().int().min(0)
	})
]);
export type ShellNoticeModel = z.infer<typeof ShellNoticeModel>;

/** The kinds `shellNoticeFor` can return; also the keys of a dismissal map. */
export type ShellNoticeKind = ShellNoticeModel['kind'];

// --- Ports ------------------------------------------------------------------

/**
 * The unread count behind the Alerts tab. Implemented over alerts' feed
 * (`GET /api/notifications` today, first mount and a stale-gated visibility
 * refresh); a rejection is treated as `0`. Shell never fetches the feed.
 */
export type ShellBadgePort = {
	unreadCount(): Promise<number>;
};

/**
 * The outcome of a verify/resend call: the server's message, or success. A
 * transport failure rejects — the state class owns the offline fallback copy.
 */
export type ShellVerifyResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly message: string };

/**
 * Access' unverified-email endpoints behind the notice's inline form
 * (`POST /signup/password/verify`, `POST /signup/password/resend`).
 */
export type ShellVerifyPort = {
	submitCode(code: string): Promise<ShellVerifyResult>;
	resendCode(): Promise<ShellVerifyResult>;
};

/**
 * Identity's time-zone save. Resolves only when the zone was stored; the
 * state class sets its once-per-user flag after that and retries on rejection
 * (the legacy code wrote the flag first, so a failed POST was never retried).
 */
export type ShellTimezonePort = {
	save(timeZone: string): Promise<void>;
};

/**
 * kernel/client's offline queue (K-07), narrowed to what the banner and the
 * replay need. `subscribe` reports online/offline changes and returns the
 * unsubscribe function.
 */
export type ShellOfflinePort = {
	isOnline(): boolean;
	pendingCount(): Promise<number>;
	subscribe(listener: (online: boolean) => void): () => void;
};

/** The four ports the chrome takes as one constructor/prop argument (R9). */
export type ShellPorts = {
	readonly badge: ShellBadgePort;
	readonly verify: ShellVerifyPort;
	readonly timezone: ShellTimezonePort;
	readonly offline: ShellOfflinePort;
};
