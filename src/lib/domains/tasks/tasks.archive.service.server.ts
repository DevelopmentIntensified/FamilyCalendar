/**
 * tasks archive service — the `/calendar/archive` read model, shared by the
 * page load and `GET /api/archive` (#292 G16). Legacy home:
 * `server/services/archiveData.ts`.
 *
 * It composes three lower modules and owns no query of its own: billing gives
 * the plan's two retention windows and the plan name (the gate), family gives
 * the viewer's families (the count on the pill), and calendar gives the
 * archived rows (personal calendar first, then the family's).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { archiveRefusal } from '$lib/domains/billing';
import { getPlanLimits, getSubscriptionSummary } from '$lib/domains/billing/index.server';
import { listArchivedEvents } from '$lib/domains/calendar/index.server';
import { listFamilies } from '$lib/domains/family/index.server';
import type { TaskArchiveEvent, TaskArchivePage } from './tasks.contract';

const DAY_MS = 86_400_000;

/** The page's "no end" stamp: the epoch, as the Android spec pins it. */
const ARCHIVE_FALLBACK_END = new Date(0);

/**
 * `GET /calendar/archive` and `GET /api/archive`.
 *
 * The gate's facts are read BEFORE the branch and returned either way — a gate
 * that misreports its own size is not a gate (125) — and the family count is
 * THIS viewer's families, never every family in the database.
 *
 * The cutoff is the viewer's plan window back from `ctx.clock.now()`, the same
 * calendar-day arithmetic legacy did in the process zone (UTC in production).
 */
export async function getArchivePage(ctx: Ctx, actor: Actor): Promise<TaskArchivePage> {
	const [limits, subscription, families] = await Promise.all([
		getPlanLimits(ctx, actor),
		getSubscriptionSummary(ctx, actor),
		listFamilies(ctx, actor)
	]);
	const planName = subscription.subscription.tier?.displayName ?? 'Free';
	const gate = {
		planName,
		familyCount: families.families.length,
		retentionDays: limits.retentionViewDays,
		archivedRetentionDays: limits.archivedRetentionDays
	};

	const reason = archiveRefusal(limits);
	if (reason) return { events: [], archiveAllowed: false, reason, ...gate };

	const cutoff = new Date(ctx.clock.now().getTime() - limits.retentionViewDays * DAY_MS);
	const rows = await listArchivedEvents(ctx, actor, { beforeIso: cutoff.toISOString() });
	const events: TaskArchiveEvent[] = rows.map((row) => ({
		...row,
		start: new Date(row.start),
		end: row.end === null ? ARCHIVE_FALLBACK_END : new Date(row.end)
	}));

	return { events, archiveAllowed: true, ...gate };
}
