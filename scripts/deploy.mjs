#!/usr/bin/env node
/**
 * deploy.mjs — branch-based deployments to each environment via the Vercel CLI.
 *
 * Usage:
 *   node scripts/deploy.mjs test     # deploy current tree to test.familyplanz.com
 *   node scripts/deploy.mjs prod     # deploy current tree to familyplanz.com (production)
 *
 * Environment targets (see `.vercel/project.json` + the project's Vercel config):
 *   test -> preview deployment, aliased to test.familyplanz.com
 *   prod -> production deployment, which Vercel auto-promotes to familyplanz.com
 *
 * The deploy is built from the CURRENT working tree (whatever branch you're on),
 * so switch to the branch you mean before running. It runs `npm run build` first
 * (never deploy a broken build), then shells out to the authenticated Vercel CLI.
 * For `test` (preview) the deployment URL is then explicit-aliased to
 * test.familyplanz.com; for `prod` the production build auto-assigns
 * familyplanz.com, so no alias step is needed.
 *
 * Optional DB schema push before deploy:
 *   DEPLOY_DB_PUSH=1 node scripts/deploy.mjs test
 * (uses db:push:preview / db:push:prod, which read .env.preview / .env.prod)
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = process.argv[2];

const TARGETS = {
	test: {
		label: 'test',
		alias: 'test.familyplanz.com',
		deployArgs: ['deploy', '--preview', '--archive=tgz', '--json'],
		dbPush: 'db:push:preview',
		envFile: '.env.preview'
	},
	prod: {
		label: 'prod',
		alias: 'familyplanz.com',
		deployArgs: ['deploy', '--prod', '--archive=tgz', '--json'],
		dbPush: 'db:push:prod',
		envFile: '.env.prod'
	}
};

function run(cmd, args, opts = {}) {
	console.log(`\n$ ${cmd} ${args.join(' ')}`);
	const r = spawnSync(cmd, args, {
		cwd: ROOT,
		stdio: opts.silent ? 'pipe' : 'inherit',
		shell: process.platform === 'win32',
		maxBuffer: 4 * 1024 * 1024
	});
	if (r.status !== 0) {
		console.error(`\n✖ "${cmd}" failed (exit ${r.status ?? 'signal'}). Aborting.`);
		process.exit(r.status ?? 1);
	}
	return r;
}

if (!ENV || !TARGETS[ENV]) {
	console.error(`Usage: node scripts/deploy.mjs <${Object.keys(TARGETS).join(' | ')}>`);
	process.exit(1);
}

const target = TARGETS[ENV];
const branch = run('git', ['branch', '--show-current'], { silent: true }).stdout?.toString().trim();

console.log(`\n==> Deploying to "${target.label}" (${target.alias})`);
console.log(`    on branch "${branch || '(detached)'}" from ${ROOT}`);

// 1. Never deploy a broken build.
run('npm', ['run', 'build']);

// 2. Optionally push DB schema to the matching env first.
if (process.env.DEPLOY_DB_PUSH === '1') {
	run('npm', ['run', target.dbPush]);
} else {
	console.log(
		`\n(skip) DB schema not pushed. To apply migrations first, re-run with DEPLOY_DB_PUSH=1` +
			` (requires ${target.envFile} with DATABASE_URL).`
	);
}

// 3. Deploy via the Vercel CLI. Capture the deployment URL from --json output.
const deployOut = run('vercel', target.deployArgs, { silent: true }).stdout?.toString().trim();
let deploymentUrl = null;
try {
	const parsed = JSON.parse(deployOut);
	deploymentUrl = parsed.url || parsed.deploymentUrl || null;
} catch {
	// Fallback: parse the last https://... URL from the text output.
	const m = deployOut?.match(/https:\/\/[^\s"]+/);
	deploymentUrl = m?.[0] ?? null;
}

if (!deploymentUrl) {
	console.error('\n✖ Could not determine the deployment URL. Inspect the Vercel output above.');
	process.exit(1);
}
console.log(`\n✔ Deployment created: ${deploymentUrl}`);

// 4. Attach the environment alias (preview only; production auto-promotes).
if (target.label === 'test') {
	run('vercel', ['alias', deploymentUrl, target.alias]);
} else {
	console.log(`\n   Production deployment auto-aliased to https://${target.alias}`);
}

console.log(`\n✔ Deployed to ${target.label}: https://${target.alias}`);
