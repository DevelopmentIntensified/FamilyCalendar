#!/usr/bin/env node
/**
 * pull-ci-secrets.mjs — refresh GitHub Actions secrets from Vercel, per env.
 *
 * Pulls the current preview and production environment variables from Vercel
 * and pushes the CI-relevant ones into GitHub Actions secrets (namespaced per
 * environment) via `gh secret set`. Run it whenever Vercel values change so CI
 * always tests against the current staging/preview DB.
 *
 * Requirements: authenticated `vercel` CLI and `gh` CLI (token with repo scope).
 *
 * Usage:
 *   node scripts/pull-ci-secrets.mjs          # sync all envs
 *   node scripts/pull-ci-secrets.mjs preview  # sync only preview
 *   node scripts/pull-ci-secrets.mjs prod     # sync only prod
 *
 * NOTE: CI e2e must run against PREVIEW only (never prod). Prod secrets are
 * pulled/stored so they're available if ever needed, but the CI workflow is
 * designed to never hand the prod database to e2e.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI_ARGS = process.argv.slice(2);
const ONLY = CLI_ARGS[0];

const ENVS = {
	preview: {
		vercelEnv: 'preview',
		vercelFile: '.env.ci.preview',
		// Keys CI actually consumes for e2e against the preview DB.
		map: {
			CI_PREVIEW_DATABASE_URL: 'DATABASE_URL',
			CI_PREVIEW_DATABASE_URL_UNPOOLED: 'DATABASE_URL_UNPOOLED',
			CI_PREVIEW_EMAILSECRET: 'EMAILSECRET',
			CI_PREVIEW_NOREPLYEMAIL: 'NOREPLYEMAIL',
			CI_PREVIEW_RESEND_API_KEY: 'RESEND_API_KEY',
			CI_PREVIEW_CEREBRAS_API_KEY: 'CEREBRAS_API_KEY'
		}
	},
	prod: {
		vercelEnv: 'production',
		vercelFile: '.env.ci.prod',
		map: {
			CI_PROD_DATABASE_URL: 'DATABASE_URL',
			CI_PROD_DATABASE_URL_UNPOOLED: 'DATABASE_URL_UNPOOLED',
			CI_PROD_EMAILSECRET: 'EMAILSECRET',
			CI_PROD_NOREPLYEMAIL: 'NOREPLYEMAIL',
			CI_PROD_RESEND_API_KEY: 'RESEND_API_KEY'
		}
	}
};

function run(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, { cwd: ROOT, shell: process.platform === 'win32', ...opts });
	if (r.status !== 0) {
		console.error(`✖ "${cmd} ${args.join(' ')}" failed (${r.status}). Aborting.`);
		process.exit(r.status ?? 1);
	}
	return r;
}

/** Parse a dotenv file into a flat map (values may contain "="). */
function parseDotenv(file) {
	const map = {};
	const txt = readFileSync(file, 'utf8');
	for (const line of txt.split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith('#') || !t.includes('=')) continue;
		const i = t.indexOf('=');
		let key = t.slice(0, i);
		let val = t.slice(i + 1);
		// Trim surrounding quotes.
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1);
		}
		map[key] = val;
	}
	return map;
}

const repo = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
	encoding: 'utf8'
}).stdout?.trim();

const envs = Object.entries(ENVS).filter(([name]) => !ONLY || name === ONLY);

for (const [envName, cfg] of envs) {
	console.log(`\n==> Pulling ${envName} env from Vercel…`);
	run('vercel', ['env', 'pull', cfg.vercelFile, `--environment=${cfg.vercelEnv}`, '--yes'], {
		encoding: 'utf8'
	});
	const values = parseDotenv(cfg.vercelFile);

	console.log(`    Setting GitHub secrets for ${envName}…`);
	for (const [ghName, vercelKey] of Object.entries(cfg.map)) {
		const val = values[vercelKey];
		if (val === undefined || val === '') {
			console.log(`    ⚠ ${ghName} skipped (no ${vercelKey} in ${envName} env)`);
			continue;
		}
		const r = spawnSync('gh', ['secret', 'set', ghName, '--repo', repo], {
			input: val,
			encoding: 'utf8'
		});
		if (r.status === 0) {
			console.log(`    ✓ ${ghName}`);
		} else {
			console.error(`    ✖ ${ghName} failed: ${(r.stderr || '').trim()}`);
			process.exit(r.status ?? 1);
		}
	}
	rmSync(cfg.vercelFile, { force: true });
}

console.log('\n✔ CI secrets synced from Vercel.');
console.log('   (e2e runs only against preview; prod secrets are stored but never handed to e2e)');
