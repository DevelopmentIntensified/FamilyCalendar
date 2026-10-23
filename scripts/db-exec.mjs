/**
 * Apply one or more .sql files against the database named by DATABASE_URL.
 *
 * Owner override 2026-10-23: schema changes run directly against Neon from
 * this repo instead of being handed to the user (#086/#088 hand-run era done).
 *
 * Usage:
 *   npx dotenv -e .env.preview -- node scripts/db-exec.mjs sql/foo.sql
 *   DATABASE_URL=postgres://... node scripts/db-exec.mjs a.sql b.sql
 *
 * Never prints DATABASE_URL. Splits files into statements the same way the
 * runtime runner does (blank-line-separated blocks) and runs each file in a
 * single transaction; any failure aborts that file's transaction and exits 1.
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const url =
	process.env.DATABASE_URL ||
	process.env.DATABASE_URL_UNPOOLED ||
	process.env.POSTGRES_URL ||
	process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
	console.error('no DATABASE_URL / DATABASE_URL_UNPOOLED / POSTGRES_URL in environment (use dotenv -e <envfile> -- )');
	process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
	console.error('usage: node scripts/db-exec.mjs <file.sql> [more.sql ...]');
	process.exit(1);
}

const [host] = url.replace(/^[^@]*@/, '').split('/');
console.log(`target: ...@${host.split(':')[0]}/${host.split('/')[0]} (host masked)`);

const db = postgres(url, { max: 1, prepare: false });

for (const file of files) {
	const text = readFileSync(file, 'utf8');
	const statements = text
		.split(/\n\s*\n/)
		.map((s) => s.trim())
		.filter(Boolean);
	try {
		await db.begin(async (tx) => {
			for (const statement of statements) {
				const rows = await tx.unsafe(statement);
				if (statement.toLowerCase().startsWith('select') && rows?.length) {
					console.log(JSON.stringify(rows.map((r) => (typeof r === 'object' ? r : { result: r }))));
				}
			}
		});
		console.log(`ok: ${file} (${statements.length} statement${statements.length === 1 ? '' : 's'})`);
	} catch (error) {
		console.error(`FAILED: ${file}:`, error.message);
		await db.end();
		process.exit(1);
	}
}

await db.end();
console.log('done');
