/**
 * Compatibility re-export for legacy code; tables live in
 * src/lib/kernel/db/tables/.
 *
 * New code imports '$lib/kernel/db/tables.server' instead (arch rule R3). This
 * file stays so the unported legacy code compiles unchanged: every table
 * object comes through the barrel, every row type is aliased back to the name
 * this module used to export, and the two domain vocabularies no table uses
 * (`BILL_CATEGORIES`, `TASK_VISIBILITIES`) are exported from here.
 */
import type { EventRow } from '$lib/kernel/db/tables.server';

export * from '$lib/kernel/db/tables.server';

export type { AccountRow as Account } from '$lib/kernel/db/tables.server';
export type { AdEventRow as AdEvent } from '$lib/kernel/db/tables.server';
export type { ApiTokenRow as ApiToken } from '$lib/kernel/db/tables.server';
export type { BillRow as Bill } from '$lib/kernel/db/tables.server';
export type { BugReportRow as BugReport } from '$lib/kernel/db/tables.server';
export type { CalendarRow as Calendar } from '$lib/kernel/db/tables.server';
export type { ClaimTokenRow as ClaimToken } from '$lib/kernel/db/tables.server';
export type { CodeRow as Code } from '$lib/kernel/db/tables.server';
export type { DeviceTokenRow as DeviceToken } from '$lib/kernel/db/tables.server';
export type { DiscountRow as Discount } from '$lib/kernel/db/tables.server';
export type { EventExceptionRow as EventException } from '$lib/kernel/db/tables.server';
export type { FamilyRow as Family } from '$lib/kernel/db/tables.server';
export type { FamilyInviteCodeRow as FamilyInviteCode } from '$lib/kernel/db/tables.server';
export type { FamilyMemberRow as FamilyMember } from '$lib/kernel/db/tables.server';
export type { GroceryItemRow as GroceryItem } from '$lib/kernel/db/tables.server';
export type { GroceryStoreColourRow as GroceryStoreColour } from '$lib/kernel/db/tables.server';
export type { GroceryStoreMemoryRow as GroceryStoreMemory } from '$lib/kernel/db/tables.server';
export type { ItemTagRow as ItemTag } from '$lib/kernel/db/tables.server';
export type { MealRow as Meal } from '$lib/kernel/db/tables.server';
export type { NotificationRow as Notification } from '$lib/kernel/db/tables.server';
export type { PushSubscriptionRow as PushSubscription } from '$lib/kernel/db/tables.server';
export type { ReceiptItemRow as ReceiptItem } from '$lib/kernel/db/tables.server';
export type { AuthSessionRow as Session } from '$lib/kernel/db/tables.server';
export type { TaskRow as Task } from '$lib/kernel/db/tables.server';
export type { TaskCategoryRow as TaskCategory } from '$lib/kernel/db/tables.server';
export type { TaskCompletionRow as TaskCompletion } from '$lib/kernel/db/tables.server';
export type { TaskfocusCommandRow as TaskfocusCommand } from '$lib/kernel/db/tables.server';
export type { TaskfocusSessionRow as TaskfocusSession } from '$lib/kernel/db/tables.server';
export type { UnmatchedPhraseRow as UnmatchedPhrase } from '$lib/kernel/db/tables.server';
export type { UserRow as User } from '$lib/kernel/db/tables.server';
export type { UserDiscountRow as UserDiscount } from '$lib/kernel/db/tables.server';
export type { UserSettingsRow as UserSettings } from '$lib/kernel/db/tables.server';
export type { WaitlistEntryRow as WaitlistEntry } from '$lib/kernel/db/tables.server';

// mirrorOf stays OPTIONAL at the type level: it is written only by the
// family-mirror path (issue 014), and a required field here would force
// every CalendarEvent/Event literal (dozens of test fixtures, the ICS
// importer, ad-event projection) to spell out `mirrorOf: null`.
export type CalendarEvent = Omit<EventRow, 'mirrorOf'> & {
	mirrorOf?: string | null;
};

/**
 * Task scoping (issue 019) — visibility of a personal task to the rest of the
 * owner's family. 'public' = family-readable (read-only), 'private' = owner +
 * assignee only. The `tasks.visibility` column is plain text, so no table uses
 * this vocabulary; it is defined here for unported importers until `tasks`
 * owns the word at its S3.
 */
export const TASK_VISIBILITIES = ['public', 'private'] as const;

export type TaskVisibility = (typeof TASK_VISIBILITIES)[number];

export { BILL_CATEGORIES, type BillCategory } from '$lib/data/categories';
