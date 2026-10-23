/**
 * #086 ground-truth probe: does the DB pointed at by DATABASE_URL match the
 * shapes declared in src/lib/server/db/schema.ts, column by column?
 *
 * Expected side: every pgTable export, keyed by PHYSICAL name (getTableName).
 * Live side: information_schema.columns.
 *
 * Usage:
 *   npx tsx --dotenv .env.prod scripts/db-schema-diff.ts
 *   or: npx dotenv -e .env.prod -- npx tsx scripts/db-schema-diff.ts
 *
 * Prints one line per mismatched column; tail prints "no drift" or the count.
 * Exit 0 clean, 1 drifted.
 */
import postgres from 'postgres';
import { getTableColumns, getTableName, Table } from 'drizzle-orm';
import { type PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../src/lib/server/db/schema';

type ColInfo = { name: string; type: string; notNull: boolean };

function pgType(col: unknown): string {
	const c = col as { getSQLType?: () => string };
	return typeof c.getSQLType === 'function' ? c.getSQLType().toLowerCase() : 'unknown';
}

function expected(): Record<string, ColInfo[]> {
	const out: Record<string, ColInfo[]> = {};
	for (const value of Object.values(schema)) {
		if (!(value instanceof Table)) continue;
		const physical = getTableName(value as PgTable);
		const cols = getTableColumns(value as PgTable);
		out[physical] = Object.values(cols).map((c) => ({
			name: (c as { name: string }).name,
			type: pgType(c),
			notNull: Boolean((c as { notNull?: boolean }).notNull)
		}));
	}
	return out;
}

async function main() {
	const url =
		process.env.DATABASE_URL ||
		process.env.DATABASE_URL_UNPOOLED ||
		process.env.POSTGRES_URL ||
		process.env.POSTGRES_URL_NON_POOLING;
	if (!url) {
		console.error('no DATABASE_URL in environment');
		process.exit(1);
	}
	const db = postgres(url, { max: 1, prepare: false });

	const exp = expected();
	const rows = await db.unsafe<{
		table_name: string;
		column_name: string;
		data_type: string;
		udt_name: string;
		is_nullable: string;
	}>(`
		SELECT table_name, column_name, data_type, udt_name, is_nullable
		FROM information_schema.columns
		WHERE table_schema = 'public'
	`);
	const live: Record<string, ColInfo[]> = {};
	for (const r of rows) {
		(live[r.table_name] ??= []).push({
			name: r.column_name,
			type:
				r.data_type.toLowerCase() === 'array'
					? `${r.udt_name.replace(/^_/, '')}[]`
					: r.data_type.toLowerCase(),
			notNull: r.is_nullable === 'NO'
		});
	}

	let drifted = 0;
	const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/ varchar\(n\)/, ' varchar').trim();
	const typeEquiv = (a: string, b: string) => {
		const x = norm(a);
		const y = norm(b);
		if (x === y) return true;
		if (x.startsWith('timestamp') && y.startsWith('timestamp'))
			return x.includes('with time zone') === y.includes('with time zone');
		return false;
	};

	for (const [table, cols] of Object.entries(exp)) {
		const liv = live[table];
		if (!liv) {
			console.log(`${table}: MISSING ENTIRE TABLE`);
			drifted++;
			continue;
		}
		const expBy = new Map(cols.map((c) => [c.name, c]));
		const livBy = new Map(liv.map((c) => [c.name, c]));
		for (const c of cols) {
			const l = livBy.get(c.name);
			if (!l) {
				console.log(`${table}.${c.name}: missing in live`);
				drifted++;
			} else if (!typeEquiv(c.type, l.type)) {
				console.log(`${table}.${c.name}: expected ${c.type}, live ${l.type}`);
				drifted++;
			} else if (!c.notNull && l.notNull) {
				console.log(`${table}.${c.name}: live is NOT NULL, expected nullable`);
				drifted++;
			}
			livBy.delete(c.name);
		}
		for (const extra of livBy.keys()) {
			console.log(`${table}.${extra}: extra in live, not declared`);
			drifted++;
		}
	}
	const knownInternal = new Set(['__schema_migrations']);
	for (const k of Object.keys(live)) {
		if (!exp[k] && !knownInternal.has(k)) {
			console.log(`${k}: live-only table (not declared)`);
			drifted++;
		}
	}

	console.log(drifted === 0 ? 'NO DRIFT: live matches schema' : `DRIFT: ${drifted} mismatches`);
	await db.end();
	process.exit(drifted === 0 ? 0 : 1);
}

main().catch((e: Error) => {
	console.error('probe failed:', e.message);
	process.exit(1);
});
