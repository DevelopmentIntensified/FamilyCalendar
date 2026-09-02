/**
 * Bundled SQL migrations.
 *
 * These are the hand-written DDL files in `sql/migrations/`, imported as raw
 * strings so they ship inside the serverless bundle and can be replayed at
 * runtime on whatever environment the code deploys to (test or prod).
 *
 * Names are sorted by their numeric prefix (001_, 002_, ...) and applied in
 * that order. Each is idempotent (uses IF NOT EXISTS) so re-runs are safe.
 */
import m001 from '../../../../../sql/migrations/001_add_ads_columns.sql?raw';
import m002 from '../../../../../sql/migrations/002_add_family_members_role.sql?raw';
import m003 from '../../../../../sql/migrations/003_create_monetization_tables.sql?raw';
import m004 from '../../../../../sql/migrations/004_add_events_all_day.sql?raw';
import m005 from '../../../../../sql/migrations/005_add_event_recurrence.sql?raw';
import m006 from '../../../../../sql/migrations/006_anonymous_accounts.sql?raw';
import m007 from '../../../../../sql/migrations/007_create_tasks.sql?raw';
import m008 from '../../../../../sql/migrations/008_add_task_tags.sql?raw';
import m009 from '../../../../../sql/migrations/009_create_bug_reports.sql?raw';
import m010 from '../../../../../sql/migrations/010_add_matched_phrase_and_cascades.sql?raw';

export type BundledMigration = { name: string; sql: string };

const MIGRATIONS: BundledMigration[] = [
	{ name: '001_add_ads_columns.sql', sql: m001 },
	{ name: '002_add_family_members_role.sql', sql: m002 },
	{ name: '003_create_monetization_tables.sql', sql: m003 },
	{ name: '004_add_events_all_day.sql', sql: m004 },
	{ name: '005_add_event_recurrence.sql', sql: m005 },
	{ name: '006_anonymous_accounts.sql', sql: m006 },
	{ name: '007_create_tasks.sql', sql: m007 },
	{ name: '008_add_task_tags.sql', sql: m008 },
	{ name: '009_create_bug_reports.sql', sql: m009 },
	{ name: '010_add_matched_phrase_and_cascades.sql', sql: m010 }
];

/** Sorted ascending by numeric prefix. */
export const bundledMigrations: BundledMigration[] = [...MIGRATIONS].sort((a, b) =>
	a.name.localeCompare(b.name, undefined, { numeric: true })
);
