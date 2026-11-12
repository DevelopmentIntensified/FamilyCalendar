// Playwright config for the page harness (K-10): the visual baseline/check that
// later powers the perf harness (K-11). The main playwright.config.ts is
// untouched — this config runs its own server, its own database and its own
// baselines, so an e2e run and a visual run never share state.
//
//   npm run visual:baseline -- groceries   (writes e2e/pages/__screenshots__)
//   npm run visual:check -- groceries      (compares)
//
// Doc: e2e/pages/README.md
import { defineConfig, devices } from '@playwright/test';
import {
	PAGES_AUTH_SECRET,
	PAGES_BASE_URL,
	PAGES_DATABASE_URL,
	withLoopbackNoProxy
} from './e2e/pages/env';

// The test process (seeds, session cookies) and the preview server must agree
// on the database and the session-signing key. Workers inherit this env; the
// server gets the same values from serve.ts.
process.env.DATABASE_URL = PAGES_DATABASE_URL;
process.env.BETTER_AUTH_SECRET = PAGES_AUTH_SECRET;

// Playwright probes `baseURL` through the host's proxy settings: an HTTP(S)_PROXY
// without NO_PROXY answers that probe with a 502 and Playwright reports the
// port as "already used". The harness only talks to loopback, so bypass the
// proxy for it — in this process (Playwright's probe + the tests) and in the
// webServer below.
for (const name of ['NO_PROXY', 'no_proxy'] as const) {
	process.env[name] = withLoopbackNoProxy(process.env[name]);
}

export default defineConfig({
	testDir: 'e2e/pages',
	// Same project tsconfig as the main config, so `$lib` resolves in the spec,
	// the seeds and session.ts (it extends .svelte-kit/tsconfig.json).
	tsconfig: './tsconfig.json',
	globalSetup: './e2e/pages/globalSetup.ts',
	// One page at a time: a screenshot is only comparable when nothing else is
	// competing for the same CPU, and the seeds share one database.
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	expect: {
		timeout: 15_000
	},
	// Baselines live in the repo, one directory per project. Deliberately no
	// `{platform}`: a baseline is only valid on the machine that wrote it
	// (font rasterisation differs between OSes), so it is regenerated locally
	// rather than shared with CI or a teammate on another platform.
	snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
	webServer: {
		command: 'npx tsx e2e/pages/serve.ts',
		url: PAGES_BASE_URL,
		// serve.ts drops the database on boot, so a server left over from an
		// earlier run is stale by definition: never reuse it.
		reuseExistingServer: false,
		timeout: 180_000,
		stdout: 'pipe',
		stderr: 'pipe',
		// Same loopback bypass as this process (serve.ts also inherits it when
		// it spawns `vite preview`).
		env: {
			NO_PROXY: process.env.NO_PROXY ?? '',
			no_proxy: process.env.no_proxy ?? ''
		}
	},
	use: {
		baseURL: PAGES_BASE_URL,
		headless: true,
		// Host-independence: the browser renders in the seeded users' zone and
		// the UI's locale, whatever the machine running the harness is set to.
		timezoneId: 'America/New_York',
		locale: 'en-US',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'off'
	},
	projects: [
		{
			name: 'desktop',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1280, height: 800 }
			}
		},
		{
			name: 'mobile',
			use: {
				...devices['Pixel 7'],
				// The harness compares at 390 px (docs/architecture/testing.md).
				// Pixel 7's 412 px viewport and 2.625 device scale would both
				// change what is compared and triple the size of every committed
				// baseline; the device profile keeps its mobile flags.
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 1
			}
		}
	]
});
