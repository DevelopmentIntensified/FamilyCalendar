import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		timeout: 120000,
		reuseExistingServer: !process.env.CI,
		stdout: 'pipe',
		stderr: 'pipe'
	},

	testDir: 'e2e',
	fullyParallel: true,
	forwardConsoleLogs: true,
	retries: process.env.CI ? 2 : 0,

	expect: {
		timeout: 10000
	},

	use: {
		headless: true,
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		launchOptions: {
			slowMo: process.env.CI ? 0 : 50
		}
	},

	projects: [
		{
			name: 'chromium',
			use: { browserName: 'chromium' }
		}
	]
});
