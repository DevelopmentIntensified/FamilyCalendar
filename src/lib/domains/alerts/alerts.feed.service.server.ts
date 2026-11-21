/**
 * alerts feed services: the Alert row itself — create, read the 50-row window,
 * mark one / all read, prune the read rows.
 *
 * Scoping to the caller lives here (every write takes `actor.id`; a foreign id
 * is a silent no-op, as the goldens pin it). Time comes from `ctx.clock`;
 * `notifications.type` is free text, so rows leave through `toAlertRow` and an
 * unrecognised value is kept, never dropped.
 *
 * `createAlert` is the one use-case other modules call (tasks on
 * assignment/completion, family on join). It inserts and then fires the push
 * without awaiting it; a failed write is logged, never thrown, because the
 * caller's own write already succeeded (legacy `createNotification`).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { AlertInput, AlertListResponse } from './alerts.contract';
import { ALERT_PAGE_SIZE } from './alerts.feed.rules';
import { alertPushPayload } from './alerts.push.rules';
import { sendAlertPush } from './alerts.push.service.server';
import { toAlertRow } from './alerts.vocabulary.rules';
import {
	countUnreadAlerts,
	deleteReadAlerts,
	deleteReadAlertsBefore,
	insertAlert,
	listAlerts,
	markAlertRead,
	markAllAlertsRead
} from './alerts.repo.server';

/** The caller's newest window plus their whole unread count — the bell and the page read this. */
export async function listAlertFeed(ctx: Ctx, actor: Actor): Promise<AlertListResponse> {
	// Sequential, not Promise.all: the ctx db may be one transaction session.
	const rows = await listAlerts(ctx.db, actor.id, ALERT_PAGE_SIZE);
	const unreadCount = await countUnreadAlerts(ctx.db, actor.id);
	return { notifications: rows.map(toAlertRow), unreadCount };
}

/**
 * Store one Alert for `input.userId` and fire its push without awaiting it.
 * `actor` is the person whose action caused the Alert (it may not be the
 * recipient: a family admin adds someone else); the push title is
 * `input.actorName`, exactly as legacy wrote it.
 *
 * A failed insert is logged, never thrown: the Alerts row is a side effect of
 * the caller's own write, so it must not fail their request.
 */
export async function createAlert(ctx: Ctx, _actor: Actor, input: AlertInput): Promise<void> {
	try {
		const row = await insertAlert(ctx.db, input, ctx.clock.now());
		void sendAlertPush(ctx, row.userId, alertPushPayload(input));
	} catch (error) {
		ctx.log.error('alert_create_failed', {
			message: error instanceof Error ? error.message : String(error)
		});
	}
}

/** Mark one of the caller's Alerts read; an unknown or foreign id changes nothing. */
export async function markAlertAsRead(ctx: Ctx, actor: Actor, id: string): Promise<void> {
	await markAlertRead(ctx.db, actor.id, id, ctx.clock.now());
}

/** Mark every unread Alert of the caller read; rows already read keep their stamp. */
export async function markAllAlertsAsRead(ctx: Ctx, actor: Actor): Promise<void> {
	await markAllAlertsRead(ctx.db, actor.id, ctx.clock.now());
}

/** Delete the caller's read Alerts; unread ones stay. Returns how many went. */
export async function pruneReadAlerts(ctx: Ctx, actor: Actor): Promise<number> {
	return await deleteReadAlerts(ctx.db, actor.id);
}

/**
 * Retention across every user, for `app`'s cron: read Alerts before the cutoff
 * go, unread ones never match. The cutoff (90 days) is the cron's constant.
 */
export async function pruneReadAlertsOlderThan(ctx: Ctx, cutoff: Date): Promise<number> {
	return await deleteReadAlertsBefore(ctx.db, cutoff);
}
