/**
 * shell services: the two use-cases behind the layouts. Shell owns no table
 * and no query — it composes domain reads through their public server entries
 * (rule R2) and narrows the result to its strict models.
 *
 * `loadShellRoot` answers the chrome's own data with **no query**: the session
 * pipeline already carries the person (`locals.user` / `locals.actor`), and
 * `ctx.clock` pins the footer year, so the component never reads `new Date()`
 * (R5 — the legacy footer did, a midnight hydration hazard).
 *
 * `loadCalendarGroup` replaces the legacy `loadUserScope`
 * (`src/lib/server/services/userScope.ts:9-22`): identity's stored settings and
 * family's id in one wave, then the roster — the legacy three reads, no more
 * (`getStoredCalendarSettings` is identity's one-query view, without the
 * ad-consent trail the group does not show). The family half degrades to
 * `null`/`[]` exactly as the legacy `try/catch` did. It reads no `url`, so —
 * unlike `(calendar)/calendar/+layout.server.ts:15` — it runs once per group
 * entry instead of once per navigation.
 *
 * Doc: ./README.md#public-interface
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { familyIdForActor, listFamilyRoster } from '$lib/domains/family/index.server';
import { getStoredCalendarSettings } from '$lib/domains/identity/index.server';
import type {
	ShellRootModel,
	ShellRosterMember,
	ShellSettingsModel,
	ShellUserSummary
} from './shell.contract';

/**
 * The session's own user row, narrowed to what shell may serialise. The load
 * hands over `locals.user`; nothing else is read from it, so a credential
 * column cannot slip into a model (hotfix #324).
 */
export type ShellSessionViewer = {
	readonly id: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string | null;
	readonly emailVerified: boolean | null;
	readonly lastActiveAt: Date | null;
};

/** What `loadCalendarGroup` answers: the shared scope without the root summary. */
export type ShellGroupScope = {
	readonly settings: ShellSettingsModel | null;
	readonly familyId: string | null;
	readonly roster: readonly ShellRosterMember[];
};

/**
 * The calendar group's shared scope (#041): identity's settings, family's id
 * and its roster. The two first reads run in parallel; the roster needs the id.
 *
 * A viewer without a settings row answers `null` (the legacy layout handed the
 * absent row through, so pages' own `?? default` fallbacks still decide). A
 * failed family read answers `null`/`[]` and is logged — never a 500.
 */
export async function loadCalendarGroup(ctx: Ctx, actor: Actor): Promise<ShellGroupScope> {
	const [settings, familyId] = await Promise.all([
		readSettings(ctx, actor),
		readFamilyId(ctx, actor)
	]);
	if (!familyId) return { settings, familyId: null, roster: [] };
	const roster = await readRoster(ctx, actor, familyId);
	// The legacy `catch` nulled BOTH fields, so a family read failure never
	// leaves pages holding an id whose roster they cannot see.
	return roster ? { settings, familyId, roster } : { settings, familyId: null, roster: [] };
}

/** The chrome's data: the session summary (or none) plus the server year. */
export function loadShellRoot(
	ctx: Ctx,
	actor: Actor | null,
	viewer: ShellSessionViewer | null
): ShellRootModel {
	return {
		user: viewer ? shellUserSummary(viewer, actor) : null,
		year: ctx.clock.now().getFullYear()
	};
}

/**
 * The whitelisted summary. `isAdmin` comes from the actor (the session
 * pipeline's `actorFromUser`), never from `users.roles` here.
 */
function shellUserSummary(viewer: ShellSessionViewer, actor: Actor | null): ShellUserSummary {
	return {
		id: viewer.id,
		firstName: viewer.firstName,
		lastName: viewer.lastName,
		email: viewer.email,
		isAdmin: actor?.isAdmin === true,
		emailVerified: viewer.emailVerified,
		lastActiveAt: viewer.lastActiveAt
	};
}

/**
 * Identity's stored settings view (one query, no consent trail), narrowed to
 * the fields the group's pages read. A view without an `id` is identity's "no
 * row" defaults object, which the legacy layout handed over as `undefined`;
 * shell keeps that distinction because the time-zone probe is gated on a
 * stored `'UTC'`.
 */
async function readSettings(ctx: Ctx, actor: Actor): Promise<ShellSettingsModel | null> {
	const settings = await getStoredCalendarSettings(ctx, actor);
	if (!('id' in settings)) return null;
	return {
		weekStart: settings.weekStart,
		timeZone: settings.timeZone,
		color: settings.color,
		defaultView: settings.defaultView,
		defaultCalendarId: settings.defaultCalendarId,
		syncEventsToFamilyCalendar: settings.syncEventsToFamilyCalendar,
		showAdsAsEvents: settings.showAdsAsEvents,
		autoParseEventDetails: settings.autoParseEventDetails,
		showDailyVerse: settings.showDailyVerse,
		hiddenDashboardModules: settings.hiddenDashboardModules
	};
}

/** Family's id for the actor; a throw is logged and degrades to "no family". */
async function readFamilyId(ctx: Ctx, actor: Actor): Promise<string | null> {
	try {
		return await familyIdForActor(ctx, actor);
	} catch (error) {
		ctx.log.error('shell_family_read_failed', {
			leg: 'familyId',
			userId: actor.id,
			message: error instanceof Error ? error.message : String(error)
		});
		return null;
	}
}

/** The roster of one family; a throw is logged and answers `null` (legacy `catch`). */
async function readRoster(
	ctx: Ctx,
	actor: Actor,
	familyId: string
): Promise<readonly ShellRosterMember[] | null> {
	try {
		const answer = await listFamilyRoster(ctx, actor, familyId);
		return answer.members;
	} catch (error) {
		ctx.log.error('shell_family_read_failed', {
			leg: 'roster',
			userId: actor.id,
			message: error instanceof Error ? error.message : String(error)
		});
		return null;
	}
}
