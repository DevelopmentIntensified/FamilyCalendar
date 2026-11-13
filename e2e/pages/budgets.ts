// The numbers `perf.spec.ts` measures against: ADR 0010's targets and hard
// limits, the run count, and the per-page initial-JS ceiling the baseline
// recorded (`e2e/pages/perf-baseline.json`, written by `npm run perf:baseline`).
//
// A missing baseline file, or a page absent from it, means "no ceiling yet" —
// never a failure. Until the baseline is written, the JS row only reports the
// ADR target.
//
// No Playwright and no browser here: `perf-report.unit.ts` imports this module
// under vitest, so it must stay plain Node.
//
// Doc: docs/adr/0010-performance-budget.md, e2e/pages/README.md
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Runs per page and profile; the median is what is compared and printed. */
export const RUNS = 5;

/**
 * ADR 0010's targets, in the units the run records: milliseconds elapsed from
 * navigation start, and gzip bytes.
 */
export const TARGETS = {
	/** desktop ready, first visit (empty cache). */
	desktopFirstReady: 500,
	/** desktop ready, repeat visit (cached assets). */
	desktopRepeatReady: 300,
	/** mobile ready, repeat visit. The mobile first visit has no target. */
	mobileRepeatReady: 600,
	/** server TTFB on the local database. */
	ttfb: 100,
	/** initial JS, gzip. */
	js: 100 * 1024
} as const;

/**
 * The four hard limits `perf:check` fails on (spec step 3). Hard limits apply
 * from a module's S7: the legacy baseline may already exceed them.
 */
export const HARD_LIMITS = {
	desktopReady: 1000,
	mobileRepeatReady: 1000,
	ttfb: 300
} as const;

/** One page's committed ceiling: it may only shrink. */
export type BaselinePage = {
	module: string;
	name: string;
	path: string;
	/** Initial JS (gzip, median) the legacy page transferred, per profile. */
	js: { desktop: number; mobile: number };
	/** The larger of the two: one ceiling per page, whichever profile measured it. */
	ceiling: number;
};

/** The committed baseline file `budgets.ts` reads and `perf:baseline` writes. */
export type Baseline = {
	generatedAt: string;
	runs: number;
	/** Keyed by `<module>/<name>` (`baselineKey`). */
	pages: Record<string, BaselinePage>;
};

/** `e2e/pages/perf-baseline.json`, resolved from this file, not the cwd. */
export const BASELINE_PATH = fileURLToPath(new URL('./perf-baseline.json', import.meta.url));

/**
 * Read the committed baseline. A file that is not there yet is the normal
 * first-run state, so it returns `undefined`; anything else (bad JSON, a
 * permissions error) is a real problem and throws.
 */
export function loadBaseline(path: string = BASELINE_PATH): Baseline | undefined {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
	return JSON.parse(text) as Baseline;
}

/** The baseline's page key: a name is unique within its module only. */
export function baselineKey(page: { module: string; name: string }): string {
	return `${page.module}/${page.name}`;
}

/** The page's recorded ceiling, or `undefined` when there is none yet. */
export function jsCeiling(
	baseline: Baseline | undefined,
	page: { module: string; name: string }
): number | undefined {
	return baseline?.pages[baselineKey(page)]?.ceiling;
}
