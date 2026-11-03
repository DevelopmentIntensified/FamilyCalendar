import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #287: /fdroid/** is plain static files on Vercel. The F-Droid client needs the
 * index to be fresh (short cache) and the APK served as an APK; an APK name is
 * versioned (com.familyplanz.app_<versionCode>.apk) so it may be cached forever.
 */
const root = process.cwd();
type Rule = { source: string; headers: { key: string; value: string }[] };
const rules: Rule[] = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')).headers;

/** Vercel applies every matching rule; later rules win for the same key. */
function headersFor(path: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const rule of rules) {
		if (new RegExp(`^${rule.source}$`).test(path)) {
			for (const h of rule.headers) out.set(h.key, h.value);
		}
	}
	return out;
}

describe('F-Droid static serving (#287)', () => {
	it('APKs: package-archive type, immutable', () => {
		const h = headersFor('/fdroid/repo/com.familyplanz.app_1001.apk');
		expect(h.get('Content-Type')).toBe('application/vnd.android.package-archive');
		expect(h.get('Cache-Control')).toContain('immutable');
		expect(
			headersFor('/fdroid/archive/com.familyplanz.app_1000.apk').get('Cache-Control')
		).toContain('immutable');
	});

	it.each([
		'/fdroid/repo/index-v2.json',
		'/fdroid/repo/entry.jar',
		'/fdroid/repo/entry.json',
		'/fdroid/repo/index-v1.jar',
		'/fdroid/qr.svg'
	])('%s: short cache, never immutable', (path) => {
		const h = headersFor(path);
		expect(h.get('Cache-Control')).toBe('public, max-age=300, must-revalidate');
	});

	it('signed index jars are served as java archives', () => {
		expect(headersFor('/fdroid/repo/entry.jar').get('Content-Type')).toBe(
			'application/java-archive'
		);
	});

	it('no SvelteKit route shadows /fdroid', () => {
		const groups = readdirSync(join(root, 'src', 'routes'));
		for (const g of groups) {
			expect(existsSync(join(root, 'src', 'routes', g, 'fdroid'))).toBe(false);
		}
		expect(existsSync(join(root, 'src', 'routes', 'fdroid'))).toBe(false);
	});

	it('the service worker never intercepts /fdroid/', () => {
		const sw = readFileSync(join(root, 'static', 'service-worker.js'), 'utf8');
		expect(sw).toMatch(/FDROID_PREFIX = '\/fdroid\/'/);
		// the bypass must come before the navigate / immutable handlers
		expect(sw.indexOf('startsWith(FDROID_PREFIX)')).toBeLessThan(
			sw.indexOf("request.mode === 'navigate'")
		);
	});
});
