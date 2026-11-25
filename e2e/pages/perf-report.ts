// The perf harness's decision half: median, the ADR 0010 comparison, and the
// three shapes a run produces (a console table per page, the results JSON, the
// committed baseline + its markdown). `perf.spec.ts` measures and writes;
// nothing in here touches Playwright, a browser or the filesystem, so
// `perf-report.unit.ts` can pin every number rule with vitest.
//
// Doc: docs/adr/0010-performance-budget.md, e2e/pages/README.md
import {
	HARD_LIMITS,
	JS_CEILING_TOLERANCE,
	RUNS,
	TARGETS,
	baselineKey,
	type Baseline,
	type BaselineProfile
} from './budgets';

export type ProfileName = 'desktop' | 'mobile';

/** A first visit: everything the run records for an empty cache. */
export type Visit = {
	/** Navigation start → the `ready` selector visible, ms. */
	ready: number;
	/** Largest Contentful Paint, ms from navigation start. */
	lcp: number;
	/** Time to first byte from navigation timing, ms. */
	ttfb: number;
	/** Transferred bytes up to the load event: initial JS (gzip). */
	js: number;
	/** Transferred bytes up to the load event: the HTML document (gzip). */
	html: number;
	/** Transferred bytes up to the load event: page data (gzip). */
	data: number;
};

/** A repeat visit in the same context: only arrival and paint. */
export type RepeatVisit = { ready: number; lcp: number };

/** One measured run: a fresh context's first visit, then its repeat visit. */
export type Run = { first: Visit; repeat: RepeatVisit };

/** Five runs, reduced to the median of every field. */
export type ProfileMeasurement = { first: Visit; repeat: RepeatVisit };

/** One page in both profiles, ready to compare, print and record. */
export type PageMeasurement = {
	module: string;
	name: string;
	path: string;
} & Record<ProfileName, ProfileMeasurement>;

/** One hard limit a page went over. */
export type Violation = {
	/** `baselineKey(page)`. */
	page: string;
	profile: ProfileName;
	metric: string;
	value: number;
	limit: number;
	unit: 'ms' | 'bytes';
	/** One line naming the page, the profile, the number and the limit. */
	message: string;
};

const NO_TARGET = '—';

/** The middle of `values`; the mean of the two middles for an even count. */
export function median(values: readonly number[]): number {
	if (values.length === 0) throw new Error('median() needs at least one value');
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Reduce a page's runs to one median measurement per profile. */
export function medianRun(runs: readonly Run[]): ProfileMeasurement {
	const first = (key: keyof Visit) => median(runs.map((run) => run.first[key]));
	const repeat = (key: keyof RepeatVisit) => median(runs.map((run) => run.repeat[key]));
	return {
		first: {
			ready: first('ready'),
			lcp: first('lcp'),
			ttfb: first('ttfb'),
			js: first('js'),
			html: first('html'),
			data: first('data')
		},
		repeat: { ready: repeat('ready'), lcp: repeat('lcp') }
	};
}

/**
 * Add `page` to a results list, or replace the entry with the same
 * `baselineKey` in place. The spec writes the list after every page, so a
 * later failure cannot lose the pages already measured.
 */
export function upsertMeasurement(
	pages: readonly PageMeasurement[],
	page: PageMeasurement
): PageMeasurement[] {
	const key = baselineKey(page);
	const index = pages.findIndex((existing) => baselineKey(existing) === key);
	if (index === -1) return [...pages, page];
	return pages.map((existing, at) => (at === index ? page : existing));
}

function formatMs(value: number): string {
	return `${Math.round(value)} ms`;
}

function formatBytes(value: number): string {
	if (value < 1024) return `${Math.round(value)} B`;
	const kb = value / 1024;
	return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`;
}

/** One approved exception to a hard limit (ADR 0010 §6). */
export type HardLimitException = {
	/**
	 * The mobile repeat-visit ready limit for this page, ms: its legacy
	 * baseline (`perf-baseline.json` `profiles.mobile.repeat.ready`, rounded
	 * down), used instead of `HARD_LIMITS.mobileRepeatReady`.
	 */
	mobileRepeatReady: number;
	/** The issue that removes the exception when it closes. */
	issue: number;
};

/**
 * ADR 0010 §6 exceptions, keyed by `baselineKey` (`<module>/<name>`).
 * Owner approval 2026-11-22: these two pages may exceed "mobile ready, repeat
 * visit ≤ 1000 ms" because legacy missed it too and ours is not slower, so the
 * limit is the legacy number, not 1000 ms. Every other limit (desktop ready,
 * desktop TTFB, initial JS) still applies to them, and every limit still
 * applies to a page with no entry. #325 (calendar month + share-target under
 * 1 s on mobile repeat) deletes these entries when it lands.
 */
export const HARD_LIMIT_EXCEPTIONS: Readonly<Record<string, HardLimitException>> = {
	'calendarPage/calendar-month': { mobileRepeatReady: 1134, issue: 325 },
	'calendarPage/share-target': { mobileRepeatReady: 1728, issue: 325 }
};

/**
 * Every hard limit `page` misses; empty means it passes. ADR 0010:
 * desktop ready (first or repeat) above 1000 ms, mobile ready (repeat) above
 * 1000 ms (a page in `HARD_LIMIT_EXCEPTIONS`: above its legacy value), desktop
 * TTFB above 300 ms, and initial JS above the page's recorded
 * legacy ceiling plus its tolerance. Mobile TTFB is informational: it includes
 * the profile's 50 ms of emulated latency. A page with no ceiling yet has no
 * JS limit.
 */
export function compareBudgets(page: PageMeasurement, ceiling?: number): Violation[] {
	const violations: Violation[] = [];
	const name = baselineKey(page);

	const fail = (
		profile: ProfileName,
		metric: string,
		value: number,
		limit: number,
		unit: 'ms' | 'bytes',
		note = ''
	) => {
		const [shownValue, shownLimit] =
			unit === 'ms' ? [formatMs(value), formatMs(limit)] : [formatBytes(value), formatBytes(limit)];
		violations.push({
			page: name,
			profile,
			metric,
			value,
			limit,
			unit,
			message: `${name} · ${profile} ${metric}: ${shownValue} is above ${shownLimit}${note}`
		});
	};

	if (page.desktop.first.ready > HARD_LIMITS.desktopReady) {
		fail('desktop', 'ready, first visit', page.desktop.first.ready, HARD_LIMITS.desktopReady, 'ms');
	}
	if (page.desktop.repeat.ready > HARD_LIMITS.desktopReady) {
		fail('desktop', 'ready, repeat visit', page.desktop.repeat.ready, HARD_LIMITS.desktopReady, 'ms');
	}
	const exception: HardLimitException | undefined = HARD_LIMIT_EXCEPTIONS[name];
	const mobileReadyLimit = exception?.mobileRepeatReady ?? HARD_LIMITS.mobileRepeatReady;
	if (page.mobile.repeat.ready > mobileReadyLimit) {
		fail(
			'mobile',
			'ready, repeat visit',
			page.mobile.repeat.ready,
			mobileReadyLimit,
			'ms',
			exception
				? ` (legacy baseline: ADR 0010 §6 exception, #${exception.issue}; the limit is ${formatMs(HARD_LIMITS.mobileRepeatReady)} elsewhere)`
				: ''
		);
	}
	if (page.desktop.first.ttfb > HARD_LIMITS.ttfb) {
		fail('desktop', 'TTFB', page.desktop.first.ttfb, HARD_LIMITS.ttfb, 'ms');
	}
	if (ceiling !== undefined) {
		const allowed = Math.floor(ceiling * (1 + JS_CEILING_TOLERANCE));
		if (page.desktop.first.js > allowed) {
			fail('desktop', 'initial JS', page.desktop.first.js, ceiling, 'bytes', ' (+2% tolerance)');
		}
		if (page.mobile.first.js > allowed) {
			fail('mobile', 'initial JS', page.mobile.first.js, ceiling, 'bytes', ' (+2% tolerance)');
		}
	}

	return violations;
}

/** Pad a plain-text table; the console rows are printed per page. */
function textTable(headers: string[], rows: string[][]): string {
	const widths = headers.map((header, column) =>
		Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length))
	);
	const line = (cells: string[]) =>
		cells
			.map((cell, column) => cell.padEnd(widths[column]))
			.join('  ')
			.trimEnd();
	return [line(headers), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join(
		'\n'
	);
}

/**
 * The console table for one page: both profiles, the ADR targets beside the
 * numbers, and the ceiling the run must not exceed.
 */
export function formatPageTable(page: PageMeasurement, ceiling?: number): string {
	const target = (desktop: string, mobile: string) => `${desktop} / ${mobile}`;
	const rows = [
		[
			'ready, first visit',
			target(formatMs(TARGETS.desktopFirstReady), NO_TARGET),
			formatMs(page.desktop.first.ready),
			formatMs(page.mobile.first.ready)
		],
		[
			'ready, repeat visit',
			target(formatMs(TARGETS.desktopRepeatReady), formatMs(TARGETS.mobileRepeatReady)),
			formatMs(page.desktop.repeat.ready),
			formatMs(page.mobile.repeat.ready)
		],
		[
			'LCP, first visit',
			target(NO_TARGET, NO_TARGET),
			formatMs(page.desktop.first.lcp),
			formatMs(page.mobile.first.lcp)
		],
		[
			'LCP, repeat visit',
			target(NO_TARGET, NO_TARGET),
			formatMs(page.desktop.repeat.lcp),
			formatMs(page.mobile.repeat.lcp)
		],
		[
			'TTFB',
			target(formatMs(TARGETS.ttfb), 'info'),
			formatMs(page.desktop.first.ttfb),
			formatMs(page.mobile.first.ttfb)
		],
		[
			'initial JS',
			target(formatBytes(TARGETS.js), formatBytes(TARGETS.js)),
			formatBytes(page.desktop.first.js),
			formatBytes(page.mobile.first.js)
		],
		[
			'HTML',
			target(NO_TARGET, NO_TARGET),
			formatBytes(page.desktop.first.html),
			formatBytes(page.mobile.first.html)
		],
		[
			'page data',
			target(NO_TARGET, NO_TARGET),
			formatBytes(page.desktop.first.data),
			formatBytes(page.mobile.first.data)
		]
	];

	return [
		`${baselineKey(page)}  (${page.path})`,
		textTable(['metric', 'target (desktop / mobile)', 'desktop', 'mobile'], rows),
		ceiling === undefined
			? 'initial JS ceiling: none yet — run npm run perf:baseline to record one'
			: `initial JS ceiling: ${formatBytes(ceiling)}`
	].join('\n');
}

/**
 * The committed baseline: every page's numbers for both profiles, plus the
 * single ceiling the next runs must not exceed. The ceiling is the larger
 * profile measurement, so neither profile may grow.
 */
export function baselineFile(pages: readonly PageMeasurement[], generatedAt: string): Baseline {
	const baseline: Baseline = { generatedAt, runs: RUNS, pages: {} };
	for (const page of pages) {
		const desktop = Math.ceil(page.desktop.first.js);
		const mobile = Math.ceil(page.mobile.first.js);
		const profiles: Record<ProfileName, BaselineProfile> = {
			desktop: page.desktop,
			mobile: page.mobile
		};
		baseline.pages[baselineKey(page)] = {
			module: page.module,
			name: page.name,
			path: page.path,
			profiles,
			ceiling: Math.max(desktop, mobile)
		};
	}
	return baseline;
}

/** A markdown pipe table; the target rows sit directly under the headers. */
function markdownTable(headers: string[], rows: string[][]): string {
	const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
	return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

/**
 * `docs/rewrite/perf-baseline.md`: the whole catalog in both profiles, slowest
 * desktop first visit first, with a target row per profile so the numbers have
 * their targets beside them. Hard limits are listed once, for the rebuilds
 * that must pass them (the legacy baseline itself may miss them).
 */
export function baselineMarkdown(pages: readonly PageMeasurement[], generatedAt: string): string {
	const slowestFirst = [...pages].sort(
		(a, b) =>
			b.desktop.first.ready - a.desktop.first.ready ||
			b.mobile.repeat.ready - a.mobile.repeat.ready ||
			baselineKey(a).localeCompare(baselineKey(b))
	);

	const targetRows = [
		[
			'**target (desktop)**',
			'desktop',
			formatMs(TARGETS.desktopFirstReady),
			formatMs(TARGETS.ttfb),
			NO_TARGET,
			formatMs(TARGETS.desktopRepeatReady),
			NO_TARGET,
			formatBytes(TARGETS.js),
			NO_TARGET,
			NO_TARGET,
			'may only shrink'
		],
		[
			'**target (mobile)**',
			'mobile',
			NO_TARGET,
			'info',
			NO_TARGET,
			formatMs(TARGETS.mobileRepeatReady),
			NO_TARGET,
			formatBytes(TARGETS.js),
			NO_TARGET,
			NO_TARGET,
			'may only shrink'
		]
	];

	const pageRows = slowestFirst.flatMap((page) => {
		const ceiling = formatBytes(Math.max(page.desktop.first.js, page.mobile.first.js));
		const row = (profile: ProfileName) => {
			const { first, repeat } = page[profile];
			return [
				baselineKey(page),
				profile,
				formatMs(first.ready),
				formatMs(first.ttfb),
				formatMs(first.lcp),
				formatMs(repeat.ready),
				formatMs(repeat.lcp),
				formatBytes(first.js),
				formatBytes(first.html),
				formatBytes(first.data),
				ceiling
			];
		};
		return [row('desktop'), row('mobile')];
	});

	return [
		'# Perf baseline',
		'',
		`Measured ${generatedAt} by \`npm run perf:baseline\` on the legacy pages, before any rebuild.`,
		'',
		`Median of ${RUNS} runs per page and profile, each first visit in a fresh browser context (empty cache) and the repeat visit in the same context. Desktop: 1280×800, 50/10 Mbps, 20 ms RTT, no CPU throttle. Mobile: Pixel 7 emulation, 4× CPU slowdown, 12/4 Mbps, 50 ms RTT. Ready time is navigation start → the catalog's \`ready\` selector; TTFB is navigation timing and includes the profile's emulated latency and any redirect hops; bytes are transferred up to the load event. Numbers come from a local \`vite preview\` and local Postgres, so they leave out real network and Neon latency; they measure what the code controls. Measure on an otherwise idle machine.`,
		'',
		'**Hard limits** (ADR 0010, enforced by `npm run perf:check` from each module\'s S7): desktop ready 1000 ms first or repeat; mobile ready 1000 ms repeat; desktop TTFB 300 ms (mobile TTFB is information); initial JS above the page\'s ceiling plus 2%.',
		'',
		markdownTable(
			[
				'page',
				'profile',
				'ready (first)',
				'TTFB',
				'LCP (first)',
				'ready (repeat)',
				'LCP (repeat)',
				'initial JS',
				'HTML',
				'page data',
				'JS ceiling'
			],
			[...targetRows, ...pageRows]
		),
		''
	].join('\n');
}
