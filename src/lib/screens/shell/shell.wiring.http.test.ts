/**
 * shell's wiring, as repo scans — the facts a component test cannot see. A
 * `http`-role file because that role is the one allowed to read the file system:
 * a rules file returns plain values and imports no `node:*` (R4). One `app.css`
 * import for the whole app (#062), no `bind:` on a child component (#200 —
 * binding the offline banner's visibility made Svelte emit an SSR settle loop
 * that 500'd every `/calendar` GET), safe-area padding on both navs, and the
 * PWA manifest/app.html wiring (`start_url` and the share target are
 * `/calendar`).
 *
 * Doc: ../README.md#how-to-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SHELL_UI = path.join(ROOT, 'src', 'lib', 'screens', 'shell', 'ui');
const ROUTES = path.join(ROOT, 'src', 'routes');

function filesUnder(dir: string, suffix: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) filesUnder(full, suffix, out);
		else if (full.endsWith(suffix)) out.push(full);
	}
	return out;
}

function read(file: string): string {
	return fs.readFileSync(file, 'utf8');
}

describe('shell wiring', () => {
	it('is the only app.css importer in src/routes', () => {
		const importers = filesUnder(ROUTES, '.svelte')
			.filter((file) => /import\s+['"][^'"]*app\.css['"]/.test(read(file)))
			.map((file) => path.relative(ROUTES, file).replaceAll('\\', '/'));
		expect(importers).toEqual(['+layout.svelte']);
	});

	it('never binds to a child component', () => {
		// Element-level bindings this module is allowed to use: the verify input's
		// value and the banner stack's measured clientHeight. Anything else would
		// be a component prop, which issue 200 forbids.
		const allowed: Record<string, true> = { value: true, clientHeight: true };
		const offenders: string[] = [];
		for (const file of filesUnder(SHELL_UI, '.svelte')) {
			for (const match of read(file).matchAll(/\bbind:(\w+)/g)) {
				if (!allowed[match[1]]) {
					offenders.push(`${path.relative(SHELL_UI, file)}: bind:${match[1]}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it('pads both navs with env(safe-area-inset-*)', () => {
		expect(read(path.join(SHELL_UI, 'ShellNavbar.svelte'))).toContain(
			'env(safe-area-inset-top)'
		);
		expect(read(path.join(SHELL_UI, 'ShellTabBar.svelte'))).toContain(
			'env(safe-area-inset-bottom)'
		);
	});

	it('starts the manifest at /calendar with a /calendar share target', () => {
		const manifest = JSON.parse(read(path.join(ROOT, 'static', 'manifest.webmanifest')));
		expect(manifest.start_url).toBe('/calendar');
		expect(manifest.share_target.action).toBe('/calendar');

		const appHtml = read(path.join(ROOT, 'src', 'app.html'));
		expect(appHtml).toContain('manifest.webmanifest');
		expect(appHtml).toContain('name="theme-color"');
	});
});
