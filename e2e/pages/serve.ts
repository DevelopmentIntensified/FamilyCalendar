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
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
	PAGES_ADMIN_URL,
	PAGES_AUTH_SECRET,
	PAGES_DATABASE_NAME,
	PAGES_DATABASE_URL,
	PAGES_PORT
} from './env';

/** The repo root: this file lives in e2e/pages, two levels down. */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** The build this server previews, and the HEAD stamp `pages:build` writes. */
const BUILD_OUTPUT = fileURLToPath(new URL('../../.svelte-kit/output', import.meta.url));
const BUILD_HEAD = fileURLToPath(new URL('../../.svelte-kit/pages-build-head', import.meta.url));

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

/**
 * Warn (never fail) when the build was made from a different commit than HEAD:
 * a stale preview screenshots old code, and the fix is to rebuild, not to
 * abort a run that is otherwise sound.
 */
function warnIfBuildMoved(): void {
	let recorded: string;
	try {
		recorded = readFileSync(BUILD_HEAD, 'utf8').trim();
	} catch {
		console.warn(
			'[pages] no build HEAD recorded (.svelte-kit/pages-build-head) — run `npm run pages:build` to stamp it.'
		);
		return;
	}
	let head: string;
	try {
		head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
	} catch {
		// Not a git checkout (packaged copy): nothing to compare against.
		return;
	}
	if (recorded && head && recorded !== head) {
		console.warn(
			`[pages] build is from ${recorded.slice(0, 12)} but HEAD is ${head.slice(0, 12)} — ` +
				'run `npm run pages:build` for a fresh preview.'
		);
	}
}

/** The built app's preview server; migrations run on its first cold start. */
function startPreview(): ChildProcess {
	const serverEnv: NodeJS.ProcessEnv = {
		...process.env,
		DATABASE_URL: PAGES_DATABASE_URL,
		BETTER_AUTH_SECRET: PAGES_AUTH_SECRET,
		NODE_ENV: 'production',
		// Production parity, and host-independence: the preview's clock and
		// `Intl` defaults are UTC whatever the machine is set to. Dates that
		// matter to a page are rendered in the user's zone (seeded settings).
		TZ: 'UTC'
	};
	// The production cold-start path must run: hooks.server.ts skips migrations
	// only when this is set, and the harness needs a migrated schema.
	delete serverEnv.DATABASE_DISABLE_MIGRATIONS;

	// One command string + `shell: true`: the form the other repo scripts use.
	// `npx` is a .cmd shim on Windows, and a bare `spawn('npx', args)` without
	// the shell fails there with ENOENT.
	return spawn(`npx vite preview --port ${PAGES_PORT} --strictPort`, {
		stdio: 'inherit',
		env: serverEnv,
		// `vite preview` must find vite.config.ts and .svelte-kit/output, so
		// run it from the repo root whatever the caller's cwd was.
		cwd: REPO_ROOT,
		// The tree kill on shutdown is Playwright's job (it owns this process
		// group).
		shell: true
	});
}

async function main(): Promise<void> {
	if (!existsSync(BUILD_OUTPUT)) {
		throw new Error('No build found. Run `npm run pages:build` before the pages harness.');
	}
	warnIfBuildMoved();

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
	// Explicit call + catch: the constants live in ./env, but this module is
	// also loadable by tooling, so starting the server must never be an import
	// side effect, and a failed start must not become an unhandled rejection.
	main().catch((error: unknown) => {
		console.error('[pages] failed to start:', error);
		process.exit(1);
	});
}
