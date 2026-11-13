// The perf harness's decision half: median, the ADR 0010 comparison, and the
// three shapes a run produces (a console table per page, the results JSON, the
// committed baseline + its markdown). `perf.spec.ts` measures and writes;
// nothing in here touches Playwright, a browser or the filesystem, so
// `perf-report.unit.ts` can pin every number rule with vitest.
//
// Doc: docs/adr/0010-performance-budget.md, e2e/pages/README.md
import { HARD_LIMITS, RUNS, TARGETS, type Baseline } from './budgets';

export type ProfileName = 'desktop' | 'mobile';

/** A first visit: everything the run records for an empty cache. */
export type Visit = {
	/** Navigation start → the `ready` selector visible, ms. */
	ready: number;
	/** Largest Contentful Paint, ms from navigation start. */
	lcp: number;
	/** Time to first byte from navigation timing, ms. */
	ttfb: number;
	/** Transferred bytes before ready: initial JS (gzip). */
	js: number;
	/** Transferred bytes before ready: the HTML document (gzip). */
	html: number;
	/** Transferred bytes before ready: page data (`__data.json`, gzip). */
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
	/** `<module>/<name>`. */
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

function formatMs(value: number): string {
	return `${Math.round(value)} ms`;
}

function formatBytes(value: number): string {
	if (value < 1024) return `${Math.round(value)} B`;
	const kb = value / 1024;
	return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`;
}

/**
 * Every hard limit `page` misses; empty means it passes. ADR 0010:
 * desktop ready (first or repeat) above 1000 ms, mobile ready (repeat) above
 * 1000 ms, TTFB above 300 ms, and initial JS above the page's recorded legacy
 * ceiling. A page with no ceiling yet has no JS limit.
 */
export function compareBudgets(page: PageMeasurement, ceiling?: number): Violation[] {
	const violations: Violation[] = [];

	const fail = (
		profile: ProfileName,
		metric: string,
		value: number,
		limit: number,
		unit: 'ms' | 'bytes'
	) => {
		const name = `${page.module}/${page.name}`;
		const [shownValue, shownLimit] =
			unit === 'ms' ? [formatMs(value), formatMs(limit)] : [formatBytes(value), formatBytes(limit)];
		violations.push({
			page: name,
			profile,
			metric,
			value,
			limit,
			unit,
			message: `${name} · ${profile} ${metric}: ${shownValue} is above ${shownLimit}`
		});
	};

	if (page.desktop.first.ready > HARD_LIMITS.desktopReady) {
		fail('desktop', 'ready, first visit', page.desktop.first.ready, HARD_LIMITS.desktopReady, 'ms');
	}
	if (page.desktop.repeat.ready > HARD_LIMITS.desktopReady) {
		fail('desktop', 'ready, repeat visit', page.desktop.repeat.ready, HARD_LIMITS.desktopReady, 'ms');
	}
	if (page.mobile.repeat.ready > HARD_LIMITS.mobileRepeatReady) {
		fail(
			'mobile',
			'ready, repeat visit',
			page.mobile.repeat.ready,
			HARD_LIMITS.mobileRepeatReady,
			'ms'
		);
	}
	if (page.desktop.first.ttfb > HARD_LIMITS.ttfb) {
		fail('desktop', 'TTFB', page.desktop.first.ttfb, HARD_LIMITS.ttfb, 'ms');
	}
	if (page.mobile.first.ttfb > HARD_LIMITS.ttfb) {
		fail('mobile', 'TTFB', page.mobile.first.ttfb, HARD_LIMITS.ttfb, 'ms');
	}
	if (ceiling !== undefined) {
		if (page.desktop.first.js > ceiling) {
			fail('desktop', 'initial JS', page.desktop.first.js, ceiling, 'bytes');
		}
		if (page.mobile.first.js > ceiling) {
			fail('mobile', 'initial JS', page.mobile.first.js, ceiling, 'bytes');
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
			target(formatMs(TARGETS.ttfb), formatMs(TARGETS.ttfb)),
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
		`${page.module} / ${page.name}  (${page.path})`,
		textTable(['metric', 'target (desktop / mobile)', 'desktop', 'mobile'], rows),
		ceiling === undefined
			? 'initial JS ceiling: none yet — run npm run perf:baseline to record one'
			: `initial JS ceiling: ${formatBytes(ceiling)}`
	].join('\n');
}

/**
 * The committed baseline: per-page ceilings the next runs must not exceed. The
 * ceiling is the larger profile measurement, so neither profile may grow.
 */
export function baselineFile(pages: readonly PageMeasurement[], generatedAt: string): Baseline {
	const baseline: Baseline = { generatedAt, runs: RUNS, pages: {} };
	for (const page of pages) {
		const desktop = Math.ceil(page.desktop.first.js);
		const mobile = Math.ceil(page.mobile.first.js);
		baseline.pages[`${page.module}/${page.name}`] = {
			module: page.module,
			name: page.name,
			path: page.path,
			js: { desktop, mobile },
			ceiling: Math.max(desktop, mobile)
		};
	}
	return baseline;
}

/** A markdown pipe table; the target row sits directly under the headers. */
function markdownTable(headers: string[], rows: string[][]): string {
	const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
	return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

/**
 * `docs/rewrite/perf-baseline.md`: the whole catalog, slowest desktop first
 * visit first, with the ADR targets as the first row so they sit beside the
 * numbers. Hard limits are not the baseline's business (legacy pages fail
 * them); they are listed once, for the rebuilds that must pass them.
 */
export function baselineMarkdown(pages: readonly PageMeasurement[], generatedAt: string): string {
	const slowestFirst = [...pages].sort(
		(a, b) =>
			b.desktop.first.ready - a.desktop.first.ready ||
			b.mobile.repeat.ready - a.mobile.repeat.ready ||
			`${a.module}/${a.name}`.localeCompare(`${b.module}/${b.name}`)
	);

	const rows = [
		[
			'**target**',
			formatMs(TARGETS.desktopFirstReady),
			formatMs(TARGETS.desktopRepeatReady),
			NO_TARGET,
			formatMs(TARGETS.mobileRepeatReady),
			formatMs(TARGETS.ttfb),
			formatMs(TARGETS.ttfb),
			formatBytes(TARGETS.js),
			formatBytes(TARGETS.js),
			'may only shrink'
		],
		...slowestFirst.map((page) => [
			`${page.module} / ${page.name}`,
			formatMs(page.desktop.first.ready),
			formatMs(page.desktop.repeat.ready),
			formatMs(page.mobile.first.ready),
			formatMs(page.mobile.repeat.ready),
			formatMs(page.desktop.first.ttfb),
			formatMs(page.mobile.first.ttfb),
			formatBytes(page.desktop.first.js),
			formatBytes(page.mobile.first.js),
			formatBytes(Math.max(page.desktop.first.js, page.mobile.first.js))
		])
	];

	return [
		'# Perf baseline',
		'',
		`Measured ${generatedAt} by \`npm run perf:baseline\` on the legacy pages, before any rebuild.`,
		'',
		`Median of ${RUNS} runs per page and profile, each first visit in a fresh browser context (empty cache) and the repeat visit in the same context. Desktop: 1280×800, 50/10 Mbps, 20 ms RTT, no CPU throttle. Mobile: Pixel 7 emulation, 4× CPU slowdown, 12/4 Mbps, 50 ms RTT. Numbers come from a local \`vite preview\` and local Postgres, so they leave out real network and Neon latency; they measure what the code controls. Measure on an otherwise idle machine.`,
		'',
		'**Hard limits** (ADR 0010, enforced by `npm run perf:check` from each module\'s S7): desktop ready 1000 ms first or repeat; mobile ready 1000 ms repeat; TTFB 300 ms; initial JS the page\'s ceiling below.',
		'',
		markdownTable(
			[
				'page',
				'desktop first',
				'desktop repeat',
				'mobile first',
				'mobile repeat',
				'TTFB (desktop)',
				'TTFB (mobile)',
				'initial JS (desktop)',
				'initial JS (mobile)',
				'JS ceiling'
			],
			rows
		),
		''
	].join('\n');
}
