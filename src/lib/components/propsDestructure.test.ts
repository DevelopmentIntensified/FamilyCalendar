import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * #277 class gate: a key declared in `interface Props` but left out of the
 * `let { … }: Props = $props()` destructure type-checks fine, yet any bare
 * template read of it is a ReferenceError (SSR 500). 03df161 shipped exactly
 * that for TasksMainList's `confirmClear`; 825c095 fixed four siblings by
 * hand. This scans every runes component so the next one fails here.
 */
const SRC = path.resolve(__dirname, '..', '..');

function svelteFiles(dir: string, out: string[] = []): string[] {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) svelteFiles(p, out);
		else if (p.endsWith('.svelte')) out.push(p);
	}
	return out;
}

/** Props keys missing from the $props() destructure (none when a rest spread exists). */
function missingProps(source: string): string[] {
	const iface = source.match(/interface Props\s*\{([\s\S]*?)\n\t\}/);
	const destructure = source.match(/let\s*\{([\s\S]*?)\}\s*:\s*Props\s*=\s*\$props\(\)/);
	if (!iface || !destructure) return [];
	if (/\.\.\.\w+/.test(destructure[1])) return [];
	const keys = [...iface[1].matchAll(/^\t\t(\w+)\??\s*:/gm)].map((m) => m[1]);
	const names = new Set([...destructure[1].matchAll(/(?:^|,)\s*(\w+)/g)].map((m) => m[1]));
	return keys.filter((k) => !names.has(k));
}

describe('every declared prop is destructured from $props() (#277)', () => {
	it('flags the 03df161 TasksMainList shape', () => {
		const broken = [
			'<script lang="ts">',
			'\tinterface Props {',
			'\t\tclearBusy: boolean;',
			'\t\tconfirmClear: boolean;',
			'\t}',
			'\tlet { clearBusy }: Props = $props();',
			'</script>'
		].join('\n');
		expect(missingProps(broken)).toEqual(['confirmClear']);
	});

	it('no component in src/ declares a prop it never destructures', () => {
		const offenders = svelteFiles(SRC)
			.map((f) => ({ f: path.relative(SRC, f), missing: missingProps(fs.readFileSync(f, 'utf8')) }))
			.filter((o) => o.missing.length > 0)
			.map((o) => `${o.f}: ${o.missing.join(', ')}`);
		expect(offenders).toEqual([]);
	});
});
