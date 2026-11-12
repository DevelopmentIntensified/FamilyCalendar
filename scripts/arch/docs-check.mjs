#!/usr/bin/env node
// `npm run docs:check` — keeps the documentation graph honest:
//  D1 every module folder with code has a README.md with the required sections
//  D2 a module README links every file in its folder (and nothing that is gone)
//  D3 every relative link in AGENTS.md, docs/ (except docs/archive/), module READMEs and e2e READMEs resolves
//  D4 AGENTS.md stays a short hub (<= 120 lines)
// Doc: docs/architecture/module-readme-template.md, docs/README.md
import { existsSync } from 'node:fs';
import path from 'node:path';
import { MODULES, moduleDir } from './registry.mjs';
import { ROOT, listFiles, markdownLinks, readText } from './lib.mjs';

const REQUIRED_SECTIONS = [
	'## Purpose',
	'## Files',
	'## Public interface',
	'## How to test',
	'## Invariants',
	'## Depends on'
];
const AGENTS_MAX_LINES = 120;

const files = listFiles();
const problems = [];
const add = (code, file, line, message) => problems.push({ code, file, line, message });

const exists = (repoPath) => existsSync(path.join(ROOT, repoPath));
const resolveLink = (fromFile, target) =>
	path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), target));

// D1 + D2
for (const module of MODULES) {
	const dir = moduleDir(module);
	const own = files.filter((file) => file.startsWith(`${dir}/`));
	if (own.length === 0) continue;
	const readme = `${dir}/README.md`;
	if (!exists(readme)) {
		add(
			'D1',
			readme,
			1,
			`module '${module.name}' has no README.md (template: docs/architecture/module-readme-template.md)`
		);
		continue;
	}
	const text = readText(readme);
	for (const section of REQUIRED_SECTIONS) {
		if (!text.split('\n').some((line) => line.trim() === section))
			add('D1', readme, 1, `missing section '${section}'`);
	}
	const linked = new Set(
		markdownLinks(text)
			.map((link) => link.target.split('#')[0])
			.filter((target) => target && !/^[a-z]+:/.test(target))
			.map((target) => resolveLink(readme, target))
	);
	for (const file of own) {
		if (file === readme) continue;
		if (!linked.has(file))
			add(
				'D2',
				readme,
				1,
				`does not link ${path.posix.relative(dir, file)} — add it to the Files table (what it does, why, its test)`
			);
	}
}

// D3
const docFiles = files.filter(
	(file) =>
		file === 'AGENTS.md' ||
		file === 'CONTEXT.md' ||
		(file.startsWith('docs/') && file.endsWith('.md') && !file.startsWith('docs/archive/')) ||
		(file.startsWith('src/lib/') && file.endsWith('/README.md')) ||
		// Harness docs live outside docs/ and src/lib/ but link into both (K-10).
		(file.startsWith('e2e/') && file.endsWith('/README.md'))
);
for (const doc of docFiles) {
	for (const link of markdownLinks(readText(doc))) {
		const target = link.target.split('#')[0];
		if (!target || /^[a-z]+:/i.test(target) || target.startsWith('//')) continue;
		if (!exists(resolveLink(doc, decodeURIComponent(target))))
			add('D3', doc, link.line, `broken link → ${link.target}`);
	}
}

// D4
if (exists('AGENTS.md')) {
	const lines = readText('AGENTS.md').split('\n').length;
	if (lines > AGENTS_MAX_LINES)
		add(
			'D4',
			'AGENTS.md',
			1,
			`${lines} lines (max ${AGENTS_MAX_LINES}) — move detail into a linked doc`
		);
}

if (problems.length === 0) {
	console.log(
		`docs:check: OK — ${docFiles.length} docs, links resolve, module READMEs cover their files`
	);
	process.exit(0);
}
for (const p of problems) console.log(`${p.code}  ${p.file}:${p.line}  ${p.message}`);
console.log(`\ndocs:check: ${problems.length} problem(s)`);
process.exit(1);
