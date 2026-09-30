// PROTOTYPE DEBUG HELPER — mirrors app-check.mjs's flat() so a syntax error in
// a prototype page can be located exactly instead of guessed at. acorn is
// already in node_modules (rollup dep), so this needs no install.
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';

const dir = 'prototypes/app-ui/';
const flat = (s) => s.replace(/^\s*import[^;]+;\s*$/gm, '').replace(/^export /gm, '');
const rd = (p) => readFileSync(dir + p, 'utf8');

const page = process.argv[2] || 'logo.html';
const body = (rd(page).match(/<script type="module">([\s\S]*?)<\/script>/) || [])[1];
if (!body) { console.log('no module script in ' + page); process.exit(1); }

// Parse the PAGE ALONE, with the same flattening app-check applies. Prefixing
// the shell data is what hides the real position, so keep them out of it.
let err = null;
try {
	parse(flat(body), { ecmaVersion: 2022, sourceType: 'script' });
	console.log('PARSE OK (page alone) — ' + page);
	process.exit(0);
} catch (e) {
	err = e;
	console.log(`ERR ${page}: ${e.message}`);
}

const all = body.split('\n');
const line = err.loc ? err.loc.line : 0;
for (let i = Math.max(0, line - 6); i < Math.min(all.length, line + 3); i++) {
	console.log(`${String(i + 1).padStart(4)} ${i + 1 === line ? '>>' : '  '} ${all[i]}`);
}

// Backtick parity: inside a template literal the parser ignores everything
// else, so a desync shows up as a wrong running count before the error line.
let open = 0;
for (let i = 0; i < Math.min(line, all.length); i++) {
	const n = (all[i].match(/`/g) || []).length;
	if (n) console.log(`      backticks ${String(i + 1).padStart(4)}: ${n}  running=${open % 2 === 0 ? 'closed' : 'OPEN'}`);
	open += n;
}
process.exit(1);
