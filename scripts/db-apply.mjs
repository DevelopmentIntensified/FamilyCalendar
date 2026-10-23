/**
 * Apply every bundled-schema migration in sql/migrations/ (numeric order)
 * to the database in DATABASE_URL. Local-dev replacement for the retired
 * drizzle-kit push path (#086): the SvelteKit runner does the same replay at
 * cold start, but a standalone apply is needed before `npm run db:seed`.
 *
 * Mirrors runner.ts semantics: each file's statements split on blank-line
 * blocks, each file in one transaction, abort on first failure.
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/db-apply.mjs
 */
import { readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const url =
	process.env.DATABASE_URL ||
	process.env.DATABASE_URL_UNPOOLED ||
	process.env.POSTGRES_URL;
if (!url) {
	console.error('no DATABASE_URL in environment');
	process.exit(1);
}

const migrationsDir = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'migrations'));
const files = readdirSync(migrationsDir)
	.filter((name) => name.endsWith('.sql'))
	.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const [hostDb] = url.replace(/^[^@]*@/, '').split('/');
console.log(`target: ...@${hostDb.replace(/\./g, '.')} · files: ${files.length}`);

const db = postgres(url, { max: 1, prepare: false });

for (const file of files) {
	const text = readFileSync(join(migrationsDir, file), 'utf8');
	const statements = text
		.split(/\n\s*\n/)
		.map((s) => s.trim())
		.filter(Boolean);
	try {
		await db.begin(async (tx) => {
			for (const statement of statements) {
				await tx.unsafe(statement);
			}
		});
		console.log(`ok: ${file}`);
	} catch (error) {
		console.error(`FAILED: ${file}:`, error.message);
		await db.end();
		process.exit(1);
	}
}

await db.end();
console.log('done - database matches the bundled schema');
