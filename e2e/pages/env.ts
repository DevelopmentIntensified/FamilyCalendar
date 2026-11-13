// The values the pages harness shares between the Playwright config, the
// preview server, the seeds and the tests (and, next door, K-11's perf run).
//
// This module imports nothing: no spawn, no postgres. `serve.ts` owns the
// server process and is imported by Playwright's webServer command only; a
// spec or K-11 can import this file without starting anything.
//
// Doc: e2e/pages/README.md
export const PAGES_DATABASE_NAME = 'familycalendar_pages';

/** Admin connection used to drop and recreate the pages database. */
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

/** The only hosts the harness talks to: everything else may go through a proxy. */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];

/**
 * `NO_PROXY` with loopback added. Playwright probes `baseURL` through the
 * environment's proxy settings: an `HTTP(S)_PROXY` without `NO_PROXY` answers
 * that probe with a 502, and Playwright reports the port as "already used".
 * Applied to the runner (scripts/pages-run.mjs), the config's test process and
 * its webServer, so the probe and the browser stay on loopback.
 */
export function withLoopbackNoProxy(value: string | undefined): string {
	const entries = (value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	// `*` already bypasses every proxy; adding hosts would only muddy it.
	if (entries.includes('*')) return entries.join(',');
	for (const host of LOOPBACK_HOSTS) {
		if (!entries.includes(host)) entries.push(host);
	}
	return entries.join(',');
}
