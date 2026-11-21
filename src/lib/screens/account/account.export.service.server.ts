/**
 * The data export (#189): one document of everything the requester owns or
 * their family exposes to them, composed in the legacy order.
 *
 * Order matters twice: legacy read identity first (the missing-row refusal must
 * land before any other read), then the five parallel slices, then calendar
 * (which needs the exported tasks' event ids), then bills. The composition is
 * sequential because `ctx.db` may be one transaction session.
 *
 * The envelope, the key order and the two scope decisions live in
 * `account.export.rules.ts`; the selects live in `account.export.repo.server.ts`
 * until each owning domain exports its slice (report ASK).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { AccountExportDocument, AccountExportSlices } from './account.contract';
import { composeAccountExport, exportedAccountRow, exportedFamilies } from './account.export.rules';
import {
	readExportBills,
	readExportEvents,
	readExportFamilies,
	readExportGroceries,
	readExportNotifications,
	readExportPerson,
	readExportSettings,
	readExportSubscriptions,
	readExportTasks
} from './account.export.repo.server';

/**
 * JSON projection of a typed row: the export is plain JSON, so a row's columns
 * are its own keys.
 *
 * SAFETY: every value here is a row the schema defined, and the document schema
 * verifies it per table; a row has no `passwordHash` because the projector
 * above dropped it.
 */
function exportRows(rows: readonly object[]): Record<string, unknown>[] {
	return rows.map((row) => ({ ...row }));
}

/**
 * The requester's document. A missing users row is a fault, never an empty
 * export: the route's caller is a proven actor, so a vanished row means the
 * data is gone, not that they own nothing.
 */
export async function getAccountExport(ctx: Ctx, actor: Actor): Promise<AccountExportDocument> {
	const person = await readExportPerson(ctx.db, actor.id);
	if (!person) throw new Error(`Export requested for missing user ${actor.id}`);

	const [settings, subscriptionRows, familyRows, tasks, groceryRows, notificationRows] =
		await Promise.all([
			readExportSettings(ctx.db, actor.id),
			readExportSubscriptions(ctx.db, actor.id),
			readExportFamilies(ctx.db, actor.id),
			readExportTasks(ctx.db, actor.id),
			readExportGroceries(ctx.db, actor.id),
			readExportNotifications(ctx.db, actor.id)
		]);

	const taskEventIds = tasks.taskRows.flatMap((task) => (task.eventId ? [task.eventId] : []));
	const eventRows = await readExportEvents(ctx.db, actor.id, taskEventIds);
	const billRows = await readExportBills(ctx.db, actor.id);

	const slices: AccountExportSlices = {
		// SAFETY: `exportedAccountRow` proved the hash is stripped; the document is a JSON projection of the row.
		account: exportedAccountRow(person) as unknown as Record<string, unknown>,
		settings: exportRows(settings),
		subscriptions: exportRows(subscriptionRows),
		families: exportedFamilies(
			familyRows.familyRows,
			familyRows.memberships,
			familyRows.allMemberRows,
			familyRows.otherMemberRows,
			actor.id
		),
		events: exportRows(eventRows.eventRows),
		eventAttendance: exportRows(eventRows.attendanceRows),
		eventExceptions: exportRows(eventRows.exceptionRows),
		tasks: exportRows(tasks.taskRows),
		taskTags: exportRows(tasks.tagRows),
		taskCompletions: exportRows(tasks.completionRows),
		bills: exportRows(billRows.billRows),
		receiptItems: exportRows(billRows.receiptItemRows),
		groceryItems: exportRows(groceryRows),
		notifications: exportRows(notificationRows)
	};

	// The envelope, the key order and both scope decisions are the rules' — the
	// reader decided them, not the caller's order.
	return composeAccountExport(slices, ctx.clock.now());
}
