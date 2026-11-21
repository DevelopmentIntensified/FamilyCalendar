// The file a perf run accumulates its numbers in: `perf-results/<scope>.json`
// (gitignored), with each page merged in as soon as it is measured.
//
// It is cleared ONCE per run, in `globalSetup.ts` — never in a worker hook.
// Playwright discards a worker after a failed test and starts a new one for the
// retry, so a `beforeAll` clear runs a second time mid-run and takes every page
// the previous worker measured with it: the legacy baseline run of 2026-11-19
// lost its first 28 pages to exactly that (`perf:baseline: 13/41 pages
// measured`, `family/family-join` flaked and passed on the retry).
//
// Doc: e2e/pages/README.md
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNS } from './budgets';
import { upsertMeasurement, type PageMeasurement } from './perf-report';

/** `e2e/pages/perf-results/`, resolved from this file, not the cwd. */
export const RESULTS_DIR = fileURLToPath(new URL('./perf-results/', import.meta.url));

/** What this module writes: one run's pages, in the order they were measured. */
type ResultsFile = { pages?: PageMeasurement[] };

/** The scope's results file: `all.json` for a full run, else `<module>.json`. */
export function resultsPath(scope: string, dir: string = RESULTS_DIR): string {
	return join(dir, `${scope}.json`);
}

/** Start the run from nothing: pages of an earlier run must not merge in. */
export function clearResults(scope: string, dir: string = RESULTS_DIR): void {
	rmSync(resultsPath(scope, dir), { force: true });
}

/** The pages already written to this run's results file. */
export function readResults(scope: string, dir: string = RESULTS_DIR): PageMeasurement[] {
	let text: string;
	try {
		text = readFileSync(resultsPath(scope, dir), 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw error;
	}
	const file: unknown = JSON.parse(text);
	if (typeof file !== 'object' || file === null || !('pages' in file)) return [];
	// This harness's own output, not a foreign format: name the shape once, and
	// let the array check keep a hand-edited file from becoming page entries.
	const { pages } = file as ResultsFile;
	return Array.isArray(pages) ? pages : [];
}

/**
 * Write this page now, merged with the pages already recorded: a failure later
 * in the run must not cost the measurements already taken, and a retried page
 * replaces its own earlier entry instead of appearing twice.
 */
export function recordMeasurement(
	scope: string,
	page: PageMeasurement,
	dir: string = RESULTS_DIR
): void {
	const pages = upsertMeasurement(readResults(scope, dir), page);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		resultsPath(scope, dir),
		`${JSON.stringify({ scope, runs: RUNS, generatedAt: new Date().toISOString(), pages }, null, 2)}\n`
	);
}
