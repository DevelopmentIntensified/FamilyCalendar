// import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import Icons from 'unplugin-icons/vite';

// v2 code lives here (docs/architecture/README.md). Legacy projects exclude it;
// the unit/db/ui projects include only it. Delete `client`/`server` when the
// legacy census reaches zero (task APP-05).
const V2 = 'src/lib/{kernel,domains,screens,app}';

export default defineConfig({
	plugins: [
		sveltekit(),
		Icons({
			compiler: 'svelte'
		})
	],

	test: {
		// `npm run test:affected` (vitest --changed) must stay a targeted run: by
		// default a package.json or vite.config edit reruns EVERY test, including
		// the 15+ minute legacy suite (docs/architecture/testing.md).
		forceRerunTriggers: [],
		projects: [
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],

				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**', `${V2}/**`],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',

				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', `${V2}/**`],
					setupFiles: ['./vitest-setup-server.ts']
				}
			},
			{
				extends: './vite.config.ts',

				test: {
					name: 'unit',
					environment: 'node',
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
					include: [`${V2}/**/*.svelte.test.ts`],
					setupFiles: ['./vitest-setup-client.ts']
				}
			}
		]
	}
});
