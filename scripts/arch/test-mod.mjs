#!/usr/bin/env node
// `npm run test:mod -- <module> [--legacy] [--watch]`
// Runs ONE module's tests so a change can be verified section by section.
//   (default)  v2 tests in the module folder (unit + ui, and db when the folder has *.db.test.ts)
//   --legacy   also the module's remaining legacy test files (from scripts/arch/legacy-map.json)
// Doc: docs/architecture/testing.md#run-one-module
import { spawnSync } from 'node:child_process';
import { moduleByName, moduleDir } from './registry.mjs';
import { ROOT, listFiles, readJson } from './lib.mjs';

const args = process.argv.slice(2);
const name = args.find((arg) => !arg.startsWith('--'));
const module = name ? moduleByName(name) : null;
if (!module) {
	console.error(
		'usage: npm run test:mod -- <module> [--legacy] [--watch]   (module names: scripts/arch/registry.mjs)'
	);
	process.exit(2);
}

const files = listFiles();
const dir = moduleDir(module);
const own = files.filter((file) => file.startsWith(`${dir}/`));
const projects = [];
const filters = [];
if (own.some((file) => /\.test\.ts$/.test(file) && !/\.(db|svelte)\.test\.ts$/.test(file)))
	projects.push('unit');
if (own.some((file) => /\.db\.test\.ts$/.test(file))) projects.push('db');
if (own.some((file) => /\.svelte\.test\.ts$/.test(file))) projects.push('ui');
if (projects.length) filters.push(`${dir}/`);

if (args.includes('--legacy')) {
	const map = readJson('scripts/arch/legacy-map.json').files;
	const present = new Set(files);
	const legacyTests = Object.entries(map)
		.filter(
			([file, info]) =>
				info.module === module.name &&
				(info.kind === 'test' || info.kind === 'route-test') &&
				present.has(file)
		)
		.map(([file]) => file);
	if (legacyTests.length) {
		if (legacyTests.some((file) => /\.svelte\.test\.ts$/.test(file))) projects.push('client');
		if (legacyTests.some((file) => !/\.svelte\.test\.ts$/.test(file))) projects.push('server');
		filters.push(...legacyTests);
	}
}

if (filters.length === 0) {
	console.log(
		`test:mod: '${module.name}' has no tests yet (${dir}/ is empty${args.includes('--legacy') ? ' and no legacy tests remain' : '; try --legacy'})`
	);
	process.exit(0);
}

const command = [
	'npx',
	'vitest',
	args.includes('--watch') ? 'watch' : 'run',
	...projects.flatMap((project) => ['--project', project]),
	...filters.map((filter) => JSON.stringify(filter))
].join(' ');
console.log(`> ${command}`);
const result = spawnSync(command, { cwd: ROOT, stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
