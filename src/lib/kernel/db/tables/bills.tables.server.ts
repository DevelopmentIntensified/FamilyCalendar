/**
 * Bills tables: the bill row, its receipt line items and the Tag Table that
 * learns item/merchant -> category.
 *
 * Definitions moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `bills` owns them (scripts/arch/registry.mjs TABLE_OWNERS). Ids
 * come from the kernel id port, "now" from the kernel clock (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { systemIds } from '$lib/kernel/ids/ids';
import { systemClock } from '$lib/kernel/time/clock';
import { users } from './identity.tables.server';
import { families } from './family.tables.server';

/**
 * Bill — a dated amount owed, family-visible. Amounts are integer cents
 * (never float). Paid status per period; recurrence arrives in #006.
 *
 * BILL_CATEGORIES/BillCategory live in `$lib/data/categories` (arch audit
 * #4) so client modules can share the vocabulary without importing this
 * server-only schema — schema re-exports them as the single source.
 */
export const bills = pgTable('bills', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	title: text('title').notNull(),
	amountCents: integer('amount_cents').notNull(),
	dueDate: timestamp('due_date', { withTimezone: true, mode: 'string' }),
	category: text('category').notNull().default('other'),
	paidAt: timestamp('paid_at', { withTimezone: true, mode: 'string' }),
	// Recurring bill schedule (#006): both null = one-off; set = recurring.
	// dueDate doubles as the cursor — mark-paid advances it (see
	// advanceBillCursor in actions/bills.ts). Base frequency vocabulary:
	// the parser's biweekly/every_N_unit values arrive already mapped to
	// frequency + interval.
	frequency: text('frequency'),
	interval: integer('interval'),
	// Provenance + draft marker (#033): 'manual' = user-created; 'email' =
	// an unconfirmed ingest draft (never counted as spent, never trains
	// the Tag Table until confirmed — confirming flips it to 'manual').
	source: text('source').notNull().default('manual'),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	familyId: text('family_id').references(() => families.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export type BillRow = typeof bills.$inferSelect;
export type NewBillRow = typeof bills.$inferInsert;

/**
 * Line Item (issue 031) — one parsed (or manually entered) receipt row on a
 * Bill: label, price cents, and its own category Label. A null category
 * inherits the Bill's category; Line-item Labels are the ground truth for
 * Spend Detail. Bill total stays authoritative — items are annotations.
 */
export const receiptItems = pgTable(
	'receiptItems',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		billId: text('billId')
			.notNull()
			.references(() => bills.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		priceCents: integer('price_cents').notNull(),
		// Nullable: null = inherits the parent bill's category.
		category: text('category'),
		position: integer('position').default(0).notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => ({
		billIdx: index('receipt_items_bill_idx').on(table.billId)
	})
);

export type ReceiptItemRow = typeof receiptItems.$inferSelect;
export type NewReceiptItemRow = typeof receiptItems.$inferInsert;

/**
 * Tag Table (issue 031) — the learning store mapping merchant/item keys to
 * categories. One row per (scope, key, category) with a weight; prediction
 * is the highest-weight row, user rows (userId set) override global rows
 * (userId null). `name` holds the learned item name for store-SKU keys.
 */
export const itemTags = pgTable(
	'itemTags',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		// Null = GLOBAL row (learned across all users); set = per-user row.
		userId: text('userId').references(() => users.id, { onDelete: 'cascade' }),
		// Normalized (lowercase, trimmed, punctuation-collapsed) merchant,
		// item-label, or (merchant|sku) key.
		key: text('key').notNull(),
		category: text('category').notNull(),
		// Learned display name for code-only (store-SKU) items; null otherwise.
		name: text('name'),
		weight: integer('weight').default(0).notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => systemClock.now())
			.notNull()
	},
	(table) => ({
		// Unique per scope+key+category so weight upserts are single-statement.
		// userId is NULL on global rows and Postgres unique treats NULLs as
		// distinct, so the global scope gets its own partial unique index.
		userKeyCategoryUnique: uniqueIndex('item_tags_user_key_category_unique')
			.on(table.userId, table.key, table.category)
			.where(sql`"userId" IS NOT NULL`),
		globalKeyCategoryUnique: uniqueIndex('item_tags_global_key_category_unique')
			.on(table.key, table.category)
			.where(sql`"userId" IS NULL`),
		// Indexed batch lookup for predictions (O(log n) at any scale).
		keyIdx: index('item_tags_key_idx').on(table.key)
	})
);

export type ItemTagRow = typeof itemTags.$inferSelect;
export type NewItemTagRow = typeof itemTags.$inferInsert;
