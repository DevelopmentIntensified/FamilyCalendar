// Node unit tests for the perf harness's pure half: the median, the ADR 0010
// comparison and the console/markdown/JSON shapes. `perf.spec.ts` measures and
// writes; everything it decides is pinned here.
//
// `*.unit.ts` is vitest-only on purpose: Playwright's default matcher takes
// `*.spec.ts` and `*.test.ts`, and this file must never join a browser run.
// Run it with `npx vitest run --project pages`.
//
// Doc: e2e/pages/README.md
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	HARD_LIMITS,
	JS_CEILING_TOLERANCE,
	RUNS,
	TARGETS,
	baselineKey,
	jsCeiling,
	loadBaseline,
	type Baseline
} from './budgets';
import {
	baselineFile,
	baselineMarkdown,
	compareBudgets,
	formatPageTable,
	median,
	medianRun,
	upsertMeasurement,
	type PageMeasurement,
	type Run
} from './perf-report';

/** ADR 0010's numbers, repeated here on purpose: the test pins the ADR, not the code. */
describe('budgets', () => {
	it('carries the ADR 0010 targets and hard limits', () => {
		expect(TARGETS).toEqual({
			desktopFirstReady: 500,
			desktopRepeatReady: 300,
			mobileRepeatReady: 600,
			ttfb: 100,
			js: 100 * 1024
		});
		expect(HARD_LIMITS).toEqual({ desktopReady: 1000, mobileRepeatReady: 1000, ttfb: 300 });
		expect(RUNS).toBe(5);
	});

	it('gives the JS ceiling 2% slack for headers and gzip jitter', () => {
		expect(JS_CEILING_TOLERANCE).toBe(0.02);
	});
});

describe('median', () => {
	it('returns the middle value of an odd list, unsorted input', () => {
		expect(median([3, 1, 5, 2, 4])).toBe(3);
	});

	it('averages the two middle values of an even list', () => {
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});

	it('returns the only value of a one-element list', () => {
		expect(median([42])).toBe(42);
	});

	it('refuses an empty list rather than inventing a number', () => {
		expect(() => median([])).toThrow();
	});
});

const run = (ready: number, repeat: number): Run => ({
	first: { ready, lcp: ready - 50, ttfb: 40, js: 1000, html: 100, data: 10 },
	repeat: { ready: repeat, lcp: repeat - 20 }
});

describe('medianRun', () => {
	it('medians every first-visit field, including the bytes, and both repeat fields', () => {
		const measured = medianRun([
			run(100, 50),
			run(500, 400),
			run(300, 200),
			run(200, 150),
			run(400, 300)
		]);
		expect(measured.first.ready).toBe(300);
		expect(measured.first.lcp).toBe(250);
		expect(measured.first.ttfb).toBe(40);
		expect(measured.first.js).toBe(1000);
		expect(measured.first.html).toBe(100);
		expect(measured.first.data).toBe(10);
		expect(measured.repeat.ready).toBe(200);
		expect(measured.repeat.lcp).toBe(180);
	});
});

type Overrides = {
	desktopFirstReady?: number;
	desktopRepeatReady?: number;
	mobileFirstReady?: number;
	mobileRepeatReady?: number;
	desktopTtfb?: number;
	mobileTtfb?: number;
	js?: number;
};

/** A comfortably-in-budget page; each test moves one number past a limit. */
function measurement(overrides: Overrides = {}): PageMeasurement {
	const js = overrides.js ?? 90 * 1024;
	const first = (ready: number, ttfb: number) => ({
		ready,
		lcp: ready - 20,
		ttfb,
		js,
		html: 12 * 1024,
		data: 2 * 1024
	});
	return {
		module: 'groceries',
		name: 'groceries',
		path: '/groceries',
		desktop: {
			first: first(overrides.desktopFirstReady ?? 400, overrides.desktopTtfb ?? 40),
			repeat: { ready: overrides.desktopRepeatReady ?? 200, lcp: 180 }
		},
		mobile: {
			first: first(overrides.mobileFirstReady ?? 900, overrides.mobileTtfb ?? 120),
			repeat: { ready: overrides.mobileRepeatReady ?? 500, lcp: 480 }
		}
	};
}

describe('compareBudgets', () => {
	it('passes a page inside every hard limit, and passes a mobile first visit above its target (it has no hard limit)', () => {
		expect(compareBudgets(measurement(), 200 * 1024)).toEqual([]);
	});

	it('fails desktop ready above 1000 ms on the first visit, and not at exactly 1000 ms', () => {
		expect(compareBudgets(measurement({ desktopFirstReady: 1000 }))).toEqual([]);
		const [violation] = compareBudgets(measurement({ desktopFirstReady: 1001 }));
		expect(violation.profile).toBe('desktop');
		expect(violation.metric).toBe('ready, first visit');
		expect(violation.value).toBe(1001);
		expect(violation.limit).toBe(HARD_LIMITS.desktopReady);
		expect(violation.page).toBe('groceries/groceries');
		expect(violation.message).toContain('groceries/groceries');
	});

	it('fails desktop ready above 1000 ms on the repeat visit', () => {
		const violations = compareBudgets(measurement({ desktopRepeatReady: 1300 }));
		expect(violations.map((violation) => violation.metric)).toEqual(['ready, repeat visit']);
	});

	it('fails mobile ready above 1000 ms on the repeat visit, but not a slow mobile first visit', () => {
		expect(compareBudgets(measurement({ mobileFirstReady: 5000 }))).toEqual([]);
		const violations = compareBudgets(measurement({ mobileRepeatReady: 1100 }));
		expect(violations.map((violation) => `${violation.profile} ${violation.metric}`)).toEqual([
			'mobile ready, repeat visit'
		]);
	});

	it('checks TTFB on the desktop profile only (the mobile profile adds emulated latency) and not at exactly 300 ms', () => {
		expect(compareBudgets(measurement({ desktopTtfb: 300 }))).toEqual([]);
		expect(compareBudgets(measurement({ mobileTtfb: 301 }))).toEqual([]);
		const desktop = compareBudgets(measurement({ desktopTtfb: 301 }));
		expect(desktop.map((violation) => violation.metric)).toEqual(['TTFB']);
		const both = compareBudgets(measurement({ desktopTtfb: 400, mobileTtfb: 400 }));
		expect(both.map((violation) => violation.profile)).toEqual(['desktop']);
	});

	it('fails initial JS only past the page ceiling plus 2%, and never without a ceiling', () => {
		const ceiling = 100 * 1024;
		const allowed = Math.floor(ceiling * (1 + JS_CEILING_TOLERANCE));
		expect(compareBudgets(measurement({ js: 200 * 1024 }))).toEqual([]);
		expect(compareBudgets(measurement({ js: allowed }), ceiling)).toEqual([]);
		const violations = compareBudgets(measurement({ js: allowed + 1 }), ceiling);
		expect(violations.map((violation) => `${violation.profile} ${violation.metric}`)).toEqual([
			'desktop initial JS',
			'mobile initial JS'
		]);
		expect(violations[0].unit).toBe('bytes');
	});
});

describe('upsertMeasurement', () => {
	it('appends a page the results file does not have yet', () => {
		const first = measurement();
		const second = measurement();
		second.name = 'second';
		expect(upsertMeasurement([first], second).map((page) => page.name)).toEqual([
			'groceries',
			'second'
		]);
	});

	it('replaces a page in place, so a rerun keeps the file order', () => {
		const first = measurement();
		const second = measurement();
		second.name = 'second';
		const replaced = measurement({ desktopFirstReady: 700 });
		const merged = upsertMeasurement([first, second], replaced);
		expect(merged).toHaveLength(2);
		expect(merged.map((page) => page.name)).toEqual(['groceries', 'second']);
		expect(merged[0].desktop.first.ready).toBe(700);
	});
});

describe('formatPageTable', () => {
	it('prints the page, both profiles, the targets and the JS ceiling', () => {
		const table = formatPageTable(measurement(), 120 * 1024);
		expect(table).toContain('groceries/groceries');
		expect(table).toContain('/groceries');
		expect(table).toContain('ready, first visit');
		expect(table).toContain('ready, repeat visit');
		expect(table).toContain('500 ms / —');
		expect(table).toContain('300 ms / 600 ms');
		expect(table).toContain('400 ms');
		expect(table).toContain('900 ms');
		expect(table).toContain('initial JS ceiling: 120 KB');
	});

	it('says no ceiling exists instead of implying a limit', () => {
		expect(formatPageTable(measurement())).toContain('initial JS ceiling: none yet');
	});
});

describe('baselineFile', () => {
	it('records both profiles in full and a ceiling that may only shrink', () => {
		const portable = measurement();
		portable.mobile.first.js = portable.desktop.first.js + 4096;
		const generatedAt = '2026-11-12T00:00:00.000Z';
		const baseline = baselineFile([portable], generatedAt);

		expect(baseline.generatedAt).toBe(generatedAt);
		expect(baseline.runs).toBe(RUNS);
		const entry = baseline.pages['groceries/groceries'];
		expect(entry.profiles.desktop.first).toEqual(portable.desktop.first);
		expect(entry.profiles.desktop.repeat).toEqual(portable.desktop.repeat);
		expect(entry.profiles.mobile.first).toEqual(portable.mobile.first);
		expect(entry.profiles.mobile.repeat).toEqual(portable.mobile.repeat);
		expect(entry.ceiling).toBe(90 * 1024 + 4096);
	});

	it('round-trips through the file into a JS ceiling (one key format)', () => {
		const portable = measurement();
		const written = baselineFile([portable], '2026-11-12T00:00:00.000Z');
		const loaded = loadBaseline(writeTemp(JSON.stringify(written)));
		expect(baselineKey(portable)).toBe('groceries/groceries');
		expect(jsCeiling(loaded, portable)).toBe(90 * 1024);
	});
});

describe('baselineMarkdown', () => {
	it('lists every page in both profiles slowest first, with a target row per profile', () => {
		const slow = measurement({ desktopFirstReady: 900 });
		slow.name = 'slow-page';
		const fast = measurement({ desktopFirstReady: 300 });
		fast.name = 'fast-page';
		const markdown = baselineMarkdown([fast, slow], '2026-11-12T00:00:00.000Z');

		expect(markdown).toContain('# Perf baseline');
		expect(markdown).toContain('2026-11-12T00:00:00.000Z');
		expect(markdown).toContain('| **target (desktop)** | desktop | 500 ms | 100 ms |');
		expect(markdown).toContain('| **target (mobile)** | mobile | — | info | — | 600 ms |');
		expect(markdown).toContain('| groceries/slow-page | desktop | 900 ms |');
		expect(markdown).toContain('| groceries/slow-page | mobile |');
		expect(markdown.indexOf('groceries/slow-page')).toBeGreaterThan(-1);
		expect(markdown.indexOf('groceries/slow-page')).toBeLessThan(
			markdown.indexOf('groceries/fast-page')
		);
	});
});

describe('loadBaseline', () => {
	it('treats a missing file as "no ceiling yet", not a failure', () => {
		expect(loadBaseline(join(tempDir(), 'absent.json'))).toBeUndefined();
	});

	it('reads a written baseline and looks up a page ceiling', () => {
		const written: Baseline = baselineFile([measurement()], '2026-11-12T00:00:00.000Z');
		const loaded = loadBaseline(writeTemp(JSON.stringify(written)));

		expect(loaded?.pages['groceries/groceries'].profiles.mobile.first.js).toBe(90 * 1024);
		expect(jsCeiling(loaded, { module: 'groceries', name: 'groceries' })).toBe(90 * 1024);
		expect(jsCeiling(loaded, { module: 'groceries', name: 'unknown' })).toBeUndefined();
		expect(jsCeiling(undefined, { module: 'groceries', name: 'groceries' })).toBeUndefined();
	});
});

/** Temp folders this file made; removed after each test, never left in %TEMP%. */
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'perf-baseline-'));
	tempDirs.push(dir);
	return dir;
}

function writeTemp(contents: string): string {
	const path = join(tempDir(), 'perf-baseline.json');
	writeFileSync(path, contents);
	return path;
}
