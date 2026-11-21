// Node unit tests for the perf run's results file: pages merged in as they are
// measured, a retried page replacing its own entry, and the once-per-run clear.
//
// The regression they pin: Playwright discards a worker after a failed test and
// starts a new one for the retry, so anything that clears this file in a worker
// hook (`test.beforeAll`) runs again mid-run and deletes the pages the previous
// worker measured (K-11, 2026-11-19: 28 of 41 pages lost, the baseline never
// written). `clearResults` is called once, from `globalSetup.ts`.
//
// `*.unit.ts` is vitest-only on purpose: Playwright's matcher takes `*.spec.ts`
// and `*.test.ts`. Run it with `npx vitest run --project pages`.
//
// Doc: e2e/pages/README.md
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageMeasurement } from './perf-report';
import { clearResults, readResults, recordMeasurement, resultsPath } from './perf-results';

describe('perf results file', () => {
	it('keeps every page measured, in the order they finished', () => {
		const dir = tempDir();
		recordMeasurement('groceries', measurement('one'), dir);
		recordMeasurement('groceries', measurement('two'), dir);

		expect(readResults('groceries', dir).map((page) => page.name)).toEqual(['one', 'two']);
	});

	it('replaces a retried page instead of recording it twice', () => {
		const dir = tempDir();
		recordMeasurement('groceries', measurement('one', 100), dir);
		recordMeasurement('groceries', measurement('two', 100), dir);
		// Playwright's retry measures the failed page again, in a new worker.
		recordMeasurement('groceries', measurement('one', 250), dir);

		const pages = readResults('groceries', dir);
		expect(pages.map((page) => page.name)).toEqual(['one', 'two']);
		expect(pages[0].desktop.first.ready).toBe(250);
	});

	it('reads a scope that was never written as no pages', () => {
		expect(readResults('absent', tempDir())).toEqual([]);
	});

	it('clears a finished run, and clearing again is harmless', () => {
		const dir = tempDir();
		recordMeasurement('groceries', measurement('one'), dir);

		clearResults('groceries', dir);
		expect(readResults('groceries', dir)).toEqual([]);
		expect(() => clearResults('groceries', dir)).not.toThrow();
	});

	it('writes one file per scope: `all` for a full run, else the module', () => {
		const dir = tempDir();
		expect(resultsPath('all', dir)).toBe(join(dir, 'all.json'));
		expect(resultsPath('groceries', dir)).toBe(join(dir, 'groceries.json'));
	});
});

/** One page's numbers: only `ready` differs between cases. */
function measurement(name: string, readyMs = 100): PageMeasurement {
	const first = { ready: readyMs, lcp: readyMs + 20, ttfb: 10, js: 50_000, html: 4_000, data: 0 };
	const repeat = { ready: readyMs, lcp: readyMs + 10 };
	return {
		module: 'groceries',
		name,
		path: `/calendar/${name}`,
		desktop: { first, repeat },
		mobile: { first, repeat }
	};
}

/** Temp folders this file made; removed after each test, never left in %TEMP%. */
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'perf-results-'));
	tempDirs.push(dir);
	return dir;
}
