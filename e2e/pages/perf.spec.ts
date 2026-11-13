// The perf check: every catalog page of PAGES_MODULE (all pages when unset),
// in the two ADR 0010 profiles, five runs each, medians. Run it through
// scripts/pages-run.mjs — `npm run perf:check -- <module>` measures one module
// against its budgets, `npm run perf:baseline` measures every page and writes
// the committed baseline.
//
// This file is deliberately thin: `perf-measure.ts` makes the contexts and
// collects the numbers, `perf-report.ts` medians, compares and formats. Ready
// time and LCP are marked inside the page, and the signed-in check runs after
// the arrival, so neither Playwright's own wait nor a check lands in the
// measurement. Each page is written to the results file as soon as it is
// measured, so a later failure never loses it.
//
// Doc: docs/adr/0010-performance-budget.md, e2e/pages/README.md
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { BASELINE_PATH, RUNS, jsCeiling, loadBaseline } from './budgets';
import { pagesForModule } from './catalog';
import { PROFILES, measureProfile, openStaging } from './perf-measure';
import {
	baselineFile,
	baselineMarkdown,
	compareBudgets,
	formatPageTable,
	upsertMeasurement,
	type PageMeasurement
} from './perf-report';
import { closeSessionDb } from '../testUtils';

/** `perf:baseline` measures and records; `perf:check` also fails on hard limits. */
const MODE = process.env.PERF_MODE === 'baseline' ? 'baseline' : 'check';

/** `all` for a full run (`perf:baseline`), else the module being checked. */
const SCOPE = process.env.PAGES_MODULE ?? 'all';

const RESULTS_DIR = fileURLToPath(new URL('./perf-results/', import.meta.url));
const RESULTS_PATH = join(RESULTS_DIR, `${SCOPE}.json`);
const BASELINE_DOC = fileURLToPath(new URL('../../docs/rewrite/perf-baseline.md', import.meta.url));

/** Read once: a missing file is "no ceiling yet", not a failure. */
const baseline = loadBaseline();

// One run, one results file: pages from a previous run must not merge in.
test.beforeAll(() => {
	rmSync(RESULTS_PATH, { force: true });
});

/** The pages already written to this run's results file. */
function readResults(): PageMeasurement[] {
	let text: string;
	try {
		text = readFileSync(RESULTS_PATH, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw error;
	}
	return (JSON.parse(text) as { pages?: PageMeasurement[] }).pages ?? [];
}

/**
 * Write this page now, merged with what earlier pages wrote: a failure later
 * in the run must not cost the measurements already taken.
 */
function recordMeasurement(page: PageMeasurement): void {
	const pages = upsertMeasurement(readResults(), page);
	mkdirSync(RESULTS_DIR, { recursive: true });
	writeFileSync(
		RESULTS_PATH,
		`${JSON.stringify({ scope: SCOPE, runs: RUNS, generatedAt: new Date().toISOString(), pages }, null, 2)}\n`
	);
}

test.afterAll(async () => {
	await closeSessionDb();
	if (MODE !== 'baseline') return;

	const pages = readResults();
	if (pages.length === 0) return;
	// A failed page must not overwrite a good baseline with a hole in it.
	const expected = pagesForModule(process.env.PAGES_MODULE).length;
	if (pages.length !== expected) {
		console.error(
			`perf:baseline: ${pages.length}/${expected} pages measured — baseline files not written`
		);
		return;
	}

	const generatedAt = new Date().toISOString();
	writeFileSync(
		BASELINE_PATH,
		`${JSON.stringify(baselineFile(pages, generatedAt), null, 2)}\n`
	);
	mkdirSync(dirname(BASELINE_DOC), { recursive: true });
	writeFileSync(BASELINE_DOC, baselineMarkdown(pages, generatedAt));
	console.log(`perf:baseline — wrote ${BASELINE_PATH} and ${BASELINE_DOC}`);
});

for (const entry of pagesForModule(process.env.PAGES_MODULE)) {
	test(`${entry.module} / ${entry.name}`, async ({ browser }) => {
		// Twenty throttled page loads per page (5 runs × 2 visits × 2 profiles).
		test.setTimeout(5 * 60_000);

		const { seed, cookies } = await openStaging(browser, entry);
		const desktop = await measureProfile(browser, PROFILES.desktop, entry, seed, cookies);
		const mobile = await measureProfile(browser, PROFILES.mobile, entry, seed, cookies);
		const result: PageMeasurement = {
			module: entry.module,
			name: entry.name,
			path: entry.path,
			desktop,
			mobile
		};
		recordMeasurement(result);

		const ceiling = jsCeiling(baseline, result);
		console.log(formatPageTable(result, ceiling));

		const violations = compareBudgets(result, ceiling);
		if (MODE === 'baseline') {
			// The legacy pages may already miss the hard limits; that is what
			// the rebuilds fix (ADR 0010, spec step 5).
			for (const violation of violations) console.warn(`over a hard limit: ${violation.message}`);
			return;
		}
		expect(
			violations.map((violation) => violation.message),
			`${entry.name} broke an ADR 0010 hard limit`
		).toEqual([]);
	});
}
