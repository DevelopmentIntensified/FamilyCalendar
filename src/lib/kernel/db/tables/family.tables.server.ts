/**
 * Family tables: the family row, its member join (role vs member type), the
 * invite codes that add members, and the parental-consent record trail.
 *
 * Definitions moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `family` owns them (scripts/arch/registry.mjs TABLE_OWNERS).
 * Ids come from the kernel id port (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { systemIds } from '$lib/kernel/ids/ids';
import { users } from './identity.tables.server';

export const familyMembers = pgTable(
	'familyMembers',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		familyId: text('family_id')
			.notNull()
			.references(() => families.id, { onDelete: 'cascade' }),
		role: text('role').default('member'),
		// Personal profile label ('parent'|'child'|'member') — NOT a
		// permission. Powers the Kids' Schedule dashboard module (decision 7).
		memberType: text('memberType').default('member')
	},
	(userFamily) => ({
		compoundKey: primaryKey({ columns: [userFamily.userId, userFamily.familyId] })
	})
);

export type FamilyMemberRow = typeof familyMembers.$inferSelect;
export type NewFamilyMemberRow = typeof familyMembers.$inferInsert;

export const familyInviteCodes = pgTable('familyInviteCodes', {
	code: text('code').notNull().primaryKey(),
	familyId: text('familyId')
		.notNull()
		.references(() => families.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expiresAt', { withTimezone: true, mode: 'date' }).notNull(),
	maxUses: integer('maxUses').default(1),
	useCount: integer('useCount').default(0),
	createdBy: text('createdBy').references(() => users.id, { onDelete: 'cascade' })
});

export type FamilyInviteCodeRow = typeof familyInviteCodes.$inferSelect;
export type NewFamilyInviteCodeRow = typeof familyInviteCodes.$inferInsert;

export const families = pgTable('families', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	name: text('name').notNull(),
	color: text('color'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export type FamilyRow = typeof families.$inferSelect;
export type NewFamilyRow = typeof families.$inferInsert;

/**
 * Parental-consent RECORD (#190). One row per consent *event* — a parent
 * creating a child account. Same shape and rationale as `adConsentRecords`
 * (#088b): evidence, not a setting. Nothing here is read at request time; a
 * row answers "did a parent consent, who, and when", which no boolean on the
 * child's row can.
 *
 * Append-only. No unique key on childUserId — a record is a trail, not a
 * current value. Cascades on user delete with every other user-scoped table.
 */
export const childConsentRecords = pgTable(
	'childConsentRecords',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		/** The child the consent is about. */
		childUserId: text('childUserId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** The parent (or family admin) who gave it. */
		parentUserId: text('parentUserId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		familyId: text('familyId').notNull(),
		/** Which surface recorded the consent. 'child-create' is the first one. */
		source: text('source').$type<'child-create'>().notNull(),
		recordedAt: timestamp('recordedAt', { mode: 'date' }).defaultNow().notNull()
	},
	(record) => ({
		// "Prove a parent consented" is a per-child history read, newest first.
		childRecordedIdx: index('child_consent_records_child_recorded_idx').on(
			record.childUserId,
			record.recordedAt
		)
	})
);

export type ChildConsentRecordRow = typeof childConsentRecords.$inferSelect;
export type NewChildConsentRecordRow = typeof childConsentRecords.$inferInsert;
