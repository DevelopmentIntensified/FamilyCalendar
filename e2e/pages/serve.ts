// The pages server: a throwaway database, a real `vite preview` of the current
// build, and the production cold-start path in charge of migrations.
//
// Run by Playwright's webServer as `npx tsx e2e/pages/serve.ts`, so the run is:
//   1. drop + create `familycalendar_pages` on the local Docker Postgres;
//   2. start `vite preview` on 4174 with DATABASE_URL pointing at it and
//      migrations ENABLED — the built server's hooks (src/hooks.server.ts) then
//      call the kernel `runMigrations` exactly as a production cold start does;
//   3. playbook step 4 originally applied the migrations here with
//      `runMigrations`, but that module imports `?raw` SQL (Vite-only), which
//      plain tsx cannot load. e2e/pages/globalSetup.ts therefore waits for the
//      server's own run to land before any test seeds.
//
// Playwright starts this before globalSetup and kills it afterwards.
//
// Doc: e2e/pages/README.md
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/** Everything in this harness uses one database name; nothing else may use it. */
export const PAGES_DATABASE_NAME = 'familycalendar_pages';
export const PAGES_ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:5433/postgres';
export const PAGES_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:5433/${PAGES_DATABASE_NAME}`;
export const PAGES_PORT = 4174;
export const PAGES_BASE_URL = `http://localhost:${PAGES_PORT}`;

/**
 * Session signing key for the pages server. It is not a secret — it only ever
 * signs sessions for the throwaway database — but it MUST be the same value in
 * the preview server and the test process, or a cookie minted by a seed would
 * not validate. playwright.pages.config.ts sets it from here.
 */
export const PAGES_AUTH_SECRET = 'family-planz-pages-harness-not-a-secret';

/** Drop and recreate the pages database, disconnecting anything still on it. */
async function resetDatabase(): Promise<void> {
	const admin = postgres(PAGES_ADMIN_URL, { max: 1, onnotice: () => {} });
	try {
		await admin.unsafe(`drop database if exists "${PAGES_DATABASE_NAME}" with (force)`);
		await admin.unsafe(`create database "${PAGES_DATABASE_NAME}"`);
	} finally {
		await admin.end({ timeout: 5 });
	}
	console.log(`[pages] recreated ${PAGES_DATABASE_NAME}`);
}

/** The built app's preview server; migrations run on its first cold start. */
function startPreview(): ChildProcess {
	const serverEnv: NodeJS.ProcessEnv = {
		...process.env,
		DATABASE_URL: PAGES_DATABASE_URL,
		BETTER_AUTH_SECRET: PAGES_AUTH_SECRET,
		NODE_ENV: 'production'
	};
	// The production cold-start path must run: hooks.server.ts skips migrations
	// only when this is set, and the harness needs a migrated schema.
	delete serverEnv.DATABASE_DISABLE_MIGRATIONS;

	return spawn(
		'npx',
		['vite', 'preview', '--port', String(PAGES_PORT), '--strictPort'],
		{
			stdio: 'inherit',
			env: serverEnv,
			// `vite preview` must find vite.config.ts and .svelte-kit/output, so
			// run it from the repo root whatever the caller's cwd was.
			cwd: fileURLToPath(new URL('../../', import.meta.url)),
			// Windows resolves npx through the shell; the tree kill on shutdown
			// is Playwright's job (it owns this process group).
			shell: process.platform === 'win32'
		}
	);
}

async function main(): Promise<void> {
	// The build lands at <repo>/.svelte-kit/output: this file is compiled where
	// it lives (e2e/pages), so climb two levels rather than trusting the cwd.
	const buildOutput = fileURLToPath(new URL('../../.svelte-kit/output', import.meta.url));
	if (!existsSync(buildOutput)) {
		throw new Error('No build found. Run `npm run pages:build` before the pages harness.');
	}

	await resetDatabase();
	const child = startPreview();

	child.on('error', (error) => {
		console.error('[pages] could not start `vite preview`:', error);
		process.exit(1);
	});
	child.on('exit', (code) => {
		// The preview server exiting is the harness exiting: Playwright treats
		// the webServer process ending as fatal, which is what we want.
		process.exit(code ?? 0);
	});

	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		process.on(signal, () => child.kill(signal));
	}
}

/** True only when this file is the entry point (`npx tsx e2e/pages/serve.ts`). */
function invokedAsScript(): boolean {
	const entry = process.argv[1];
	return typeof entry === 'string' && /e2e[\\/]pages[\\/]serve\.ts$/.test(entry);
}

if (invokedAsScript()) {
	// Explicit call + catch: this module is also imported by the Playwright
	// config for its constants, so starting the server must never be an import
	// side effect, and a failed start must not become an unhandled rejection.
	main().catch((error: unknown) => {
		console.error('[pages] failed to start:', error);
		process.exit(1);
	});
}
