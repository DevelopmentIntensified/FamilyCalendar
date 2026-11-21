// The perf baseline's once-per-run bookkeeping: after every test and every
// retry, read this run's results file and either write the two committed
// baseline files or fail the run naming each page that is missing.
//
// Run-level on purpose. A worker hook (`afterAll`) is the wrong place: it fires
// once per worker, and Playwright starts a new worker for a retry, so the same
// code would judge a half-finished file — and throw — while the retry that
// finishes the job has not run yet (K-11, 2026-11-19: a 26-minute run that lost
// 28 of 41 pages and reported success).
//
// Wired as `globalTeardown` in playwright.pages.config.ts; a visual or check
// run is a no-op.
//
// Doc: docs/adr/0010-performance-budget.md, e2e/pages/README.md
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_PATH, baselineKey } from './budgets';
import { pagesForModule } from './catalog';
import { baselineFile, baselineMarkdown } from './perf-report';
import { readResults } from './perf-results';

const BASELINE_DOC = fileURLToPath(new URL('../../docs/rewrite/perf-baseline.md', import.meta.url));

export default async function globalTeardown(): Promise<void> {
	// Only `perf:baseline` records the committed numbers; `perf:check` just
	// leaves its gitignored results file behind.
	if (process.env.PERF_MODE !== 'baseline') return;

	const scope = process.env.PAGES_MODULE ?? 'all';
	const pages = readResults(scope);

	// A failed page must not overwrite a good baseline with a hole in it — and a
	// shortfall must not pass for a finished run either: name every page that is
	// missing and fail, so the gap shows in the exit code.
	const expected = pagesForModule(process.env.PAGES_MODULE);
	const measured = new Set(pages.map((page) => baselineKey(page)));
	const missing = expected.map((entry) => baselineKey(entry)).filter((key) => !measured.has(key));
	if (missing.length > 0) {
		throw new Error(
			`perf:baseline: ${pages.length}/${expected.length} pages measured — baseline files not written. ` +
				`Missing: ${missing.join(', ')}. Each one has its own test error above; fix the cause ` +
				'(or measure just that page with `npm run perf:check -- <module>`) and run `perf:baseline` again.'
		);
	}

	const generatedAt = new Date().toISOString();
	writeFileSync(BASELINE_PATH, `${JSON.stringify(baselineFile(pages, generatedAt), null, 2)}\n`);
	mkdirSync(dirname(BASELINE_DOC), { recursive: true });
	writeFileSync(BASELINE_DOC, baselineMarkdown(pages, generatedAt));
	console.log(`perf:baseline — wrote ${BASELINE_PATH} and ${BASELINE_DOC}`);
}
