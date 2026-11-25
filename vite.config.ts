// import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import Icons from 'unplugin-icons/vite';

// The v2 code root (docs/architecture/README.md). The legacy projects are gone
// (APP-05), so every test file in src lives under one of these four.
const V2 = 'src/lib/{kernel,domains,screens,app}';

/**
 * v2 goldens and day boundaries assume production's zone: Node runs in UTC
 * there and Postgres renders `timestamptz` as '2026-10-07 13:00:00+00'. Vitest
 * writes `test.env` into each worker at the top of its run (setupCommonEnv),
 * before setup files and test imports, and Node re-reads `process.env.TZ` when
 * it is assigned, so every Date in a v2 test sees UTC on any machine.
 *
 * The db project gets Postgres too: vitestGlobalSetup.db.ts sets the test
 * database's default `timezone = 'UTC'`, matching that render.
 */
const V2_ENV = { TZ: 'UTC' };

export default defineConfig({
	plugins: [
		sveltekit(),
		Icons({
			compiler: 'svelte'
		})
	],

	test: {
		// `npm run test:affected` (vitest --changed) must stay a targeted run: by
		// default a package.json or vite.config edit reruns EVERY test
		// (docs/architecture/testing.md).
		forceRerunTriggers: [],
		projects: [
			{
				extends: './vite.config.ts',

				test: {
					name: 'unit',
					environment: 'node',
					env: V2_ENV,
					include: [`${V2}/**/*.test.ts`],
					exclude: [`${V2}/**/*.db.test.ts`, `${V2}/**/*.svelte.test.ts`],
					setupFiles: ['./src/lib/kernel/testing/vitestSetup.unit.ts']
				}
			},
			{
				extends: './vite.config.ts',

				test: {
					name: 'db',
					environment: 'node',
					env: V2_ENV,
					include: [`${V2}/**/*.db.test.ts`],
					setupFiles: ['./src/lib/kernel/testing/vitestSetup.db.ts'],
					globalSetup: ['./src/lib/kernel/testing/vitestGlobalSetup.db.ts'],
					// One file at a time in one process: committed-mode (truncateAll)
					// tests and rollback tests share one database.
					pool: 'forks',
					poolOptions: { forks: { singleFork: true } }
				}
			},
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],

				test: {
					name: 'ui',
					environment: 'jsdom',
					clearMocks: true,
					env: V2_ENV,
					include: [`${V2}/**/*.svelte.test.ts`],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',

				test: {
					// The page harness's pure logic (K-11). Its tests end in
					// `.unit.ts`, not `.test.ts`: Playwright's default matcher takes
					// `.spec.ts` and `.test.ts`, and nothing in e2e/pages may join a
					// browser run by accident. Plain node — no database, no browser.
					name: 'pages',
					environment: 'node',
					include: ['e2e/pages/**/*.unit.ts']
				}
			}
		]
	}
});
