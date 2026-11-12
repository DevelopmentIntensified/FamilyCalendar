/**
 * Sponsored tables: the ad inventory and the append-only ad-consent record
 * trail (#088) that proves when a user granted or withdrew consent.
 *
 * Definitions moved verbatim out of the legacy `src/lib/server/db/schema.ts`
 * (task K-04); `sponsored` owns them
 * (scripts/arch/registry.mjs TABLE_OWNERS). Ids come from the kernel id port
 * (rule R5).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { systemIds } from '../../ids/ids';
import { users } from './identity.tables.server';

export const adEvents = pgTable('adEvents', {
	id: text('id')
		.notNull()
		.primaryKey()
		.$defaultFn(() => systemIds.id()),
	sponsorName: text('sponsorName').notNull(),
	message: text('message').notNull(),
	ctaText: text('ctaText'),
	ctaLink: text('ctaLink'),
	targetPlan: text('targetPlan'),
	deadline: timestamp('deadline', { mode: 'date' }),
	scheduledFor: timestamp('scheduledFor', { mode: 'date' }).notNull(),
	expiresAt: timestamp('expiresAt', { mode: 'date' }),
	impressions: integer('impressions').default(0).notNull(),
	clicks: integer('clicks').default(0).notNull(),
	conversions: integer('conversions').default(0).notNull(),
	createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull()
});

export type AdEventRow = typeof adEvents.$inferSelect;
export type NewAdEventRow = typeof adEvents.$inferInsert;

/** The decision an adConsentRecords row can record. */
export type AdConsentDecision = 'granted' | 'withdrawn';

/**
 * Ad consent RECORD (#088). One row per consent *event* — a user turning ads
 * on, and a user turning them off. This is evidence, not a preference: it
 * answers "prove I consented" and "when did they withdraw", neither of which
 * `userSettings.showAdsAsEvents` can answer on its own.
 *
 * Deliberately NOT a second source of truth. Nothing here is read at serve
 * time: `shouldServeAds(userSettings)` remains the whole gate, and no row here
 * can change whether an ad renders. The setting is the current value; this is
 * the trail of how it got there.
 *
 * Append-only. A transition appends; nothing rewrites or deletes a row, so
 * `decision` ordered by `recordedAt` is the consent history. There is no
 * unique key on userId — that was the bug in the old `userAdConsent` table,
 * which could hold exactly one row per user and so could never record history
 * at all.
 */
export const adConsentRecords = pgTable(
	'adConsentRecords',
	{
		id: text('id')
			.notNull()
			.primaryKey()
			.$defaultFn(() => systemIds.id()),
		userId: text('userId')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** The decision this row records: consent given, or consent withdrawn. */
		decision: text('decision').$type<AdConsentDecision>().notNull(),
		recordedAt: timestamp('recordedAt', { mode: 'date' }).defaultNow().notNull()
	},
	(record) => ({
		// "Prove I consented" and "when did they withdraw" are both a per-user
		// history read, ordered newest-first.
		userRecordedIdx: index('ad_consent_records_user_recorded_idx').on(record.userId, record.recordedAt)
	})
);

export type AdConsentRecordRow = typeof adConsentRecords.$inferSelect;
export type NewAdConsentRecordRow = typeof adConsentRecords.$inferInsert;
