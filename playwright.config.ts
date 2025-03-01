import { defineConfig } from '@playwright/test';

export default defineConfig({
	// webServer: {
	// 	command: 'npm run build && npm run preview',
	// 	port: 4173
	// },

	testDir: 'e2e',
	use: {
		headless: true,
		baseURL: 'http://localhost:5173',
		launchOptions: {
			slowMo: 50
		}
	}
});
