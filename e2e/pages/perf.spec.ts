// The perf check: every catalog page of PAGES_MODULE (all pages when unset),
// in the two ADR 0010 profiles, five runs each, medians. Run it through
// scripts/pages-run.mjs — `npm run perf:check -- <module>` measures one module
// against its budgets, `npm run perf:baseline` measures every page and writes
// the committed baseline.
//
// This file is deliberately thin: `perf-measure.ts` makes the contexts and
// collects the numbers, `perf-report.ts` medians, compares and formats,
// `perf-results.ts` owns the run's results file, and `globalTeardown.ts` turns
// a complete run into the committed baseline. Ready time and LCP are marked
// inside the page, and the signed-in check runs after the arrival, so neither
// Playwright's own wait nor a check lands in the measurement. Each page is
// written to the results file as soon as it is measured, so a later failure
// never loses it — and the file is cleared once per run, in `globalSetup.ts`,
// because Playwright replaces a worker after a failed test and a clear in here
// would fire again, mid-run, on the retry.
//
// Doc: docs/adr/0010-performance-budget.md, e2e/pages/README.md
import { expect, test } from '@playwright/test';
import { jsCeiling, loadBaseline } from './budgets';
import { pagesForModule } from './catalog';
import { PROFILES, measureProfile, openStaging } from './perf-measure';
import { compareBudgets, formatPageTable, type PageMeasurement } from './perf-report';
import { recordMeasurement } from './perf-results';
import { closeSessionDb } from '../testUtils';

/** `perf:baseline` measures and records; `perf:check` also fails on hard limits. */
const MODE = process.env.PERF_MODE === 'baseline' ? 'baseline' : 'check';

/** `all` for a full run (`perf:baseline`), else the module being checked. */
const SCOPE = process.env.PAGES_MODULE ?? 'all';

/** Read once: a missing file is "no ceiling yet", not a failure. */
const baseline = loadBaseline();

test.afterAll(async () => {
	await closeSessionDb();
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
		recordMeasurement(SCOPE, result);

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
