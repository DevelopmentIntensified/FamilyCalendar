import adapterVercel from '@sveltejs/adapter-vercel';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Native app builds (see scripts/build-capacitor.mjs) emit a static,
// client-rendered bundle into build/ for Capacitor. Vercel deploys
// keep the server adapter.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === '1';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: isCapacitorBuild
			? adapterStatic({ pages: 'build', assets: 'build', fallback: 'index.html' })
			: adapterVercel({
					runtime: 'nodejs24.x'
				})
	}
};

export default config;