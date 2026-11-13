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
// measurement.
//
// Doc: docs/adr/0010-performance-budget.md, e2e/pages/README.md
import { mkdirSync, writeFileSync } from 'node:fs';
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
	type PageMeasurement
} from './perf-report';
import { closeSessionDb } from '../testUtils';

/** `perf:baseline` measures and records; `perf:check` also fails on hard limits. */
const MODE = process.env.PERF_MODE === 'baseline' ? 'baseline' : 'check';

const RESULTS_DIR = fileURLToPath(new URL('./perf-results/', import.meta.url));
const BASELINE_DOC = fileURLToPath(new URL('../../docs/rewrite/perf-baseline.md', import.meta.url));

/** Read once: a missing file is "no ceiling yet", not a failure. */
const baseline = loadBaseline();

/** Every measured page, in completion order; `afterAll` writes it out once. */
const measurements: PageMeasurement[] = [];

test.afterAll(async () => {
	await closeSessionDb();
	if (measurements.length === 0) return;

	const scope = process.env.PAGES_MODULE ?? 'all';
	const generatedAt = new Date().toISOString();
	mkdirSync(RESULTS_DIR, { recursive: true });
	writeFileSync(
		join(RESULTS_DIR, `${scope}.json`),
		`${JSON.stringify({ scope, runs: RUNS, generatedAt, pages: measurements }, null, 2)}\n`
	);

	if (MODE !== 'baseline') return;
	// A failed page must not overwrite a good baseline with a hole in it.
	const expected = pagesForModule(process.env.PAGES_MODULE).length;
	if (measurements.length !== expected) {
		console.error(
			`perf:baseline: ${measurements.length}/${expected} pages measured — baseline files not written`
		);
		return;
	}
	writeFileSync(
		BASELINE_PATH,
		`${JSON.stringify(baselineFile(measurements, generatedAt), null, 2)}\n`
	);
	mkdirSync(dirname(BASELINE_DOC), { recursive: true });
	writeFileSync(BASELINE_DOC, baselineMarkdown(measurements, generatedAt));
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
		measurements.push(result);

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
