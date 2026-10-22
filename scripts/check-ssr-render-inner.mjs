import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = '.svelte-kit/output/server/entries';

const files = [];
function walk(dir) {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) walk(p);
		else if (p.endsWith('.js')) files.push(p);
	}
}

try {
	walk(root);
} catch {
	console.error(`✗ ${root} not found — run the build first`);
	process.exit(1);
}

const bad = [];
for (const file of files) {
	const src = readFileSync(file, 'utf8');
	if (!src.includes('$$render_inner')) continue;
	const defined = /(?:function\s+|\b(?:const|let|var)\s+.*=\s*(?:async\s*)?\(?[^)=]*\)?\s*=>)\s*\$\$render_inner/.test(src);
	if (defined) {
		continue;
	}
	bad.push(`${file}: $$render_inner called with no local definition (legacy-compile SSR bug, issue 200)`);
}

if (bad.length > 0) {
	console.error('✗ bare $$render_inner detected:');
	for (const line of bad) console.error(`  ${line}`);
	process.exit(1);
}

console.log(`✓ ssr-render-inner check: ${files.length} compiled modules, no bare $$render_inner`);
