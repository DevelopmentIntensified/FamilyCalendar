/**
 * Bundled-migration parity gate (#196 slice 2, materializes #050's lesson).
 *
 * The cold-start runner only applies what `scripts.ts` imports. A migration
 * file added to `sql/migrations/` but not bundled silently never runs on
 * deployed databases — the exact prod drift that caused #050/#051. This test
 * fails when a file exists in `sql/migrations/` without a matching bundle
 * entry, so the omission can never be silent again.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { bundledMigrations } from './scripts.js';

describe('bundled migrations', () => {
	let dirFiles: string[];

	beforeAll(() => {
		const migrationsDir = new URL('../../../../../sql/migrations/', import.meta.url);
		dirFiles = readdirSync(migrationsDir)
			.filter((name) => name.endsWith('.sql'))
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	});

	it('bundles every sql/migrations file (no silent drift)', () => {
		const bundledNames = bundledMigrations.map((m) => m.name);

		for (const file of dirFiles) {
			expect(bundledNames, `sql/migrations/${file} is not bundled — it would never run on deployed databases`).toContain(file);
		}
	});

	it('bundles byte-identical sql content (no stale ?raw chunks)', () => {
		const migrationsDir = new URL('../../../../../sql/migrations/', import.meta.url);

		for (const m of bundledMigrations) {
			const onDisk = readFileSync(new URL(m.name, migrationsDir), 'utf8');
			expect(m.sql, `${m.name} bundled content differs from sql/migrations/${m.name}`).toBe(onDisk);
		}
	});

	it('stays in ascending numeric order (runner applies them in this order)', () => {
		const names = bundledMigrations.map((m) => m.name);
		const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
		expect(names).toEqual(sorted);
	});
});
