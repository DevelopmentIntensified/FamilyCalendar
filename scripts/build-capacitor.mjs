// Build the client bundle for the Capacitor native app (SPA mode).
// Sets CAPACITOR_BUILD so svelte.config.js swaps the Vercel adapter for
// the static adapter outputting to build/.
process.env.CAPACITOR_BUILD = '1';

const { build } = await import('vite');
await build();