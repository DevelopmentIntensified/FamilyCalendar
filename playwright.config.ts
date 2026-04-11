import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		timeout: 120000,
		reuseExistingServer: !process.env.CI,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			DATABASE_URL: process.env.DATABASE_URL,
			RESEND_API: process.env.RESEND_API,
			NOREPLYEMAIL: process.env.NOREPLYEMAIL,
			EMAILSECRET: process.env.EMAILSECRET,
			ADAPTER: process.env.ADAPTER,
			NODE_ENV: process.env.NODE_ENV
		}
	},

	testDir: 'e2e',
	fullyParallel: true,
	forwardConsoleLogs: true,
	retries: process.env.CI ? 2 : 0,

	expect: {
		timeout: 10000
	},

	tsconfig: './tsconfig.json',

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
			use: { ...devices['Desktop Chrome'] }
		}
	]
});