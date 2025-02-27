import { defineConfig } from '@playwright/test';

export default defineConfig({
	// webServer: {
	// 	command: 'npm run build && npm run preview',
	// 	port: 4173
	// },

	testDir: 'e2e',
	use: {
		headless: false,
		baseURL: "http://localhost:5173",
	}
});
