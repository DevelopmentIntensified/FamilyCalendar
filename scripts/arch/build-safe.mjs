#!/usr/bin/env node
// `npm run build:safe` — `npm run build` with an environment that cannot reach a
// real database or service. Use it for every local build on rewrite/v2
// (`npm run gate:push` does).
//
// Why: prerendering imports src/hooks.server.ts, which starts the migration
// runner and connects to DATABASE_URL. The main checkout's .env points at the
// PRODUCTION Neon branch (2026-10-21 incident: a local build ran migrations on
// prod). `$env/static/private` also needs every private name defined at build
// time, and auth refuses to load in production mode without a secret.
//
// The overlay always wins: Vite gives process.env priority over .env files.
// The values are placeholders, so a local build is never deployable. Vercel
// builds its own output with its own env.
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib.mjs';

const overlay = {
	DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5433/familycalendar',
	DATABASE_DISABLE_MIGRATIONS: '1',
	BETTER_AUTH_SECRET: 'local-build-placeholder-not-a-secret',
	EMAILSECRET: 'local-build-placeholder-not-a-secret',
	NOREPLYEMAIL: 'noreply@example.invalid',
	RESEND_API_KEY: 're_local_build_placeholder',
	ADAPTER: '',
	NODE_OPTIONS: '--max-old-space-size=4096'
};

console.log(`build:safe: overlay ${Object.keys(overlay).join(', ')}`);
const result = spawnSync('npm run build', {
	cwd: ROOT,
	stdio: 'inherit',
	shell: true,
	env: { ...process.env, ...overlay }
});
process.exit(result.status ?? 1);
