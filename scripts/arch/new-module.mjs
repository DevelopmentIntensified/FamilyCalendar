#!/usr/bin/env node
// `npm run new:module -- <name>` — scaffold a registered module folder:
// README.md (from the template, with registry facts filled in), index.ts,
// index.server.ts (domains), ui/index.ts. Refuses names not in registry.mjs
// and folders that already exist. Doc: docs/rewrite/playbooks/port-a-module.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MODULES, TABLE_OWNERS, moduleByName, moduleDir } from './registry.mjs';
import { ROOT } from './lib.mjs';

const name = process.argv[2];
const module = name ? moduleByName(name) : null;
if (!module || (module.kind !== 'domain' && module.kind !== 'screen')) {
	console.error(
		'usage: npm run new:module -- <domain-or-screen name from scripts/arch/registry.mjs>'
	);
	process.exit(2);
}
const dir = moduleDir(module);
if (existsSync(path.join(ROOT, dir))) {
	console.error(`${dir} already exists — edit it instead`);
	process.exit(2);
}

const lower = MODULES.filter((m) => m.kind === 'domain' && m.rank < (module.rank ?? Infinity)).map(
	(m) => m.name
);
const mayImport =
	module.kind === 'screen'
		? 'kernel + every domain (public entries only); never another screen'
		: `kernel${lower.length ? ` + ${lower.join(', ')}` : ''} (public entries only)`;
const tables = Object.entries(TABLE_OWNERS)
	.filter(([, owner]) => owner === module.name)
	.map(([table]) => `\`${table}\``);
const up = dir
	.split('/')
	.map(() => '..')
	.join('/');

const template = readFileSync(
	path.join(ROOT, 'docs/architecture/module-readme-template.md'),
	'utf8'
);
const body = template
	.split('<!-- template:begin -->')[1]
	.split('<!-- template:end -->')[0]
	.replaceAll('{{name}}', module.name)
	.replaceAll('{{kind}}', module.kind)
	.replaceAll('{{purpose}}', module.purpose)
	.replaceAll('{{mayImport}}', mayImport)
	.replaceAll('{{tables}}', tables.length ? tables.join(', ') : 'none')
	.replaceAll('{{up}}', up)
	.trimStart();

const write = (relative, content) => {
	const target = path.join(ROOT, dir, relative);
	mkdirSync(path.dirname(target), { recursive: true });
	writeFileSync(target, content);
	console.log(`created ${dir}/${relative}`);
};

write('README.md', body);
write(
	'index.ts',
	`/**\n * ${module.name} — public isomorphic interface: contract types, pure rules, client api.\n * Other modules import ${module.name} ONLY through this file, index.server.ts or ui/index.ts (rule R2).\n * Doc: ./README.md#public-interface\n */\nexport {};\n`
);
if (module.kind === 'domain' || module.kind === 'screen') {
	write(
		'index.server.ts',
		`/**\n * ${module.name} — public server interface: services and http handlers.\n * Doc: ./README.md#public-interface\n */\nexport {};\n`
	);
}
write(
	'ui/index.ts',
	`/**\n * ${module.name} — public components.\n * Doc: ../README.md#public-interface\n */\nexport {};\n`
);
console.log(
	`\nnext: fill in ${dir}/README.md, then follow docs/rewrite/playbooks/port-a-module.md`
);
