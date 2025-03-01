import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const adapter = process.env.ADAPTER === 'vercel' ? adapterVercel : adapterStatic;
const adapterConfig = {
	pages: 'build',
	assets: 'build',
	fallback: null,
	precompress: false,
	strict: true
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(process.env.ADAPTER === "vercel" ? {} : adapterConfig)
	}
};

export default config;
