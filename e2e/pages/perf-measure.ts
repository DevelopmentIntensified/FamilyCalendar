// The perf harness's measuring half: the two ADR 0010 profiles, a fresh
// context per run, the in-page ready/LCP probe, and the CDP byte counter.
// `perf.spec.ts` is then only the catalog loop, the report and the budget
// assertion.
//
// Everything here is Playwright/CDP; the numbers it produces are reduced and
// judged by the pure `perf-report.ts`.
//
// Doc: docs/adr/0010-performance-budget.md, e2e/pages/README.md
import {
	devices,
	type Browser,
	type BrowserContextOptions,
	type CDPSession,
	type Page
} from '@playwright/test';
import { RUNS, baselineKey } from './budgets';
import type { PageEntry } from './catalog';
import { PAGES_BASE_URL } from './env';
import {
	medianRun,
	type ProfileMeasurement,
	type ProfileName,
	type Run,
	type Visit
} from './perf-report';
import type { SeedResult } from './seeds';
import { expectSignedIn, gotoPage, openAs } from './session';

const ORIGIN = new URL(PAGES_BASE_URL).origin;

/** A cookie `openAs` staged, copied into every fresh context. */
export type StagedCookie = {
	name: string;
	value: string;
	domain: string;
	path: string;
	expires: number;
	httpOnly: boolean;
	secure: boolean;
	sameSite: 'Strict' | 'Lax' | 'None';
};

export type Profile = {
	/** The context the run creates; baseURL/timezone/locale do not come from `use`. */
	context: BrowserContextOptions;
	latencyMs: number;
	downloadBytesPerSecond: number;
	uploadBytesPerSecond: number;
	cpuSlowdown?: number;
};

/** One megabit per second, in the bytes-per-second CDP takes. */
const MBPS = 1_000_000 / 8;

const pixel7 = devices['Pixel 7'];

/** The ADR 0010 profiles, spelled out so no device field leaks into a context. */
export const PROFILES: Record<ProfileName, Profile> = {
	desktop: {
		context: {
			baseURL: PAGES_BASE_URL,
			viewport: { width: 1280, height: 800 },
			timezoneId: 'America/New_York',
			locale: 'en-US'
		},
		latencyMs: 20,
		downloadBytesPerSecond: 50 * MBPS,
		uploadBytesPerSecond: 10 * MBPS
	},
	mobile: {
		context: {
			baseURL: PAGES_BASE_URL,
			userAgent: pixel7.userAgent,
			viewport: pixel7.viewport,
			deviceScaleFactor: pixel7.deviceScaleFactor,
			isMobile: pixel7.isMobile,
			hasTouch: pixel7.hasTouch,
			timezoneId: 'America/New_York',
			locale: 'en-US'
		},
		latencyMs: 50,
		downloadBytesPerSecond: 12 * MBPS,
		uploadBytesPerSecond: 4 * MBPS,
		cpuSlowdown: 4
	}
};

/**
 * Run the seed and sign in once, then hand the cookies to each fresh context:
 * five seeds per page would only re-delete and re-insert the same rows.
 */
export async function openStaging(
	browser: Browser,
	entry: PageEntry
): Promise<{ seed: SeedResult; cookies: StagedCookie[] }> {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		const seed = await openAs(page, entry.seed);
		return { seed, cookies: await context.cookies() };
	} finally {
		await context.close();
	}
}

/** Five runs for one profile, reduced to the median of every field. */
export async function measureProfile(
	browser: Browser,
	profile: Profile,
	entry: PageEntry,
	seed: SeedResult,
	cookies: StagedCookie[]
): Promise<ProfileMeasurement> {
	const runs: Run[] = [];
	for (let index = 0; index < RUNS; index += 1) {
		runs.push(await measureRun(browser, profile, entry, seed, cookies));
	}
	return medianRun(runs);
}

/** One run: a fresh context's first visit, then the repeat visit in it. */
async function measureRun(
	browser: Browser,
	profile: Profile,
	entry: PageEntry,
	seed: SeedResult,
	cookies: StagedCookie[]
): Promise<Run> {
	const context = await browser.newContext(profile.context);
	try {
		await context.addCookies(cookies);
		const page = await context.newPage();
		const cdp = await context.newCDPSession(page);
		await applyProfile(cdp, profile);
		const bytes = createByteCounter(cdp, ORIGIN);
		await installReadyProbe(page, entry.ready);

		await gotoPage(page, entry, seed);
		const marks = await readMarks(page, entry);
		// One fixed byte cut-off: everything transferred up to the load event is
		// "initial"; lazy chunks after it do not count.
		await page.waitForLoadState('load');
		const first: Visit = { ...marks, ...bytes.snapshot() };
		// A network round trip, deliberately outside the measured window.
		await expectSignedIn(page, entry, seed);

		// A same-URL goto is a reload in Chromium; every page gets an ordinary
		// navigation, starting from a blank document.
		await page.goto('about:blank');
		await gotoPage(page, entry, seed);
		const again = await readMarks(page, entry);
		return { first, repeat: { ready: again.ready, lcp: again.lcp } };
	} finally {
		await context.close();
	}
}

/** The profile's network and CPU conditions, applied before anything loads. */
async function applyProfile(cdp: CDPSession, profile: Profile): Promise<void> {
	await cdp.send('Network.enable');
	await cdp.send('Network.emulateNetworkConditions', {
		offline: false,
		latency: profile.latencyMs,
		downloadThroughput: profile.downloadBytesPerSecond,
		uploadThroughput: profile.uploadBytesPerSecond
	});
	if (profile.cpuSlowdown !== undefined) {
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
	}
}

/** Transferred bytes per category, accumulated from the CDP network events. */
type ByteCounter = { snapshot: () => Pick<Visit, 'js' | 'html' | 'data'> };

function createByteCounter(cdp: CDPSession, origin: string): ByteCounter {
	const requests = new Map<string, { url: string; type: string }>();
	const bytes = { js: 0, html: 0, data: 0 };

	cdp.on('Network.requestWillBeSent', (event) => {
		requests.set(event.requestId, { url: event.request.url, type: event.type ?? 'Other' });
	});
	cdp.on('Network.loadingFinished', (event) => {
		const request = requests.get(event.requestId);
		if (!request) return;
		requests.delete(event.requestId);
		// Only the app's own origin counts; the harness never loads a CDN.
		if (!request.url.startsWith(origin)) return;
		// Page data: SvelteKit's `__data.json`, or any same-origin Fetch/XHR
		// (an SSR first visit inlines its data, so `__data.json` alone reads 0).
		if (request.url.includes('__data.json') || request.type === 'Fetch' || request.type === 'XHR') {
			bytes.data += event.encodedDataLength;
			return;
		}
		if (request.type === 'Document') bytes.html += event.encodedDataLength;
		if (request.type === 'Script') bytes.js += event.encodedDataLength;
	});

	return { snapshot: () => ({ ...bytes }) };
}

/** The marks a visit is judged on, read from the document itself. */
type Marks = Pick<Visit, 'ready' | 'lcp' | 'ttfb'>;

/**
 * Mark the moment the catalog entry's `ready` selector becomes visible, and
 * keep the latest LCP entry, inside the document — Playwright's own wait adds
 * IPC latency, and the checks after the arrival must not stretch the window.
 * The probe matches the selector with `document.querySelector`, so a catalog
 * entry must use a plain CSS selector. Init scripts run on every navigation,
 * so the repeat visit gets its own mark.
 */
async function installReadyProbe(page: Page, selector: string): Promise<void> {
	await page.addInitScript((readySelector: string) => {
		const state: { readyAt: number | null; lcp: number | null } = { readyAt: null, lcp: null };
		const observer = new PerformanceObserver((entries) => {
			for (const entry of entries.getEntries()) {
				state.lcp = Math.max(state.lcp ?? 0, entry.startTime);
			}
		});
		observer.observe({ type: 'largest-contentful-paint', buffered: true });
		// A named boundary rather than an inline cast: the probe is ours, the
		// window type is the browser's.
		const scope = window as unknown as {
			__pagePerf?: { state: typeof state; observer: PerformanceObserver };
		};
		scope.__pagePerf = { state, observer };

		// rAF only, deliberately: it does not run while rendering is blocked, so
		// the mark lands on a frame the ready element could actually paint.
		const tick = () => {
			if (state.readyAt === null) {
				const element = document.querySelector(readySelector);
				if (element) {
					const rect = element.getBoundingClientRect();
					const hidden = getComputedStyle(element).visibility === 'hidden';
					if (rect.width > 0 && rect.height > 0 && !hidden) state.readyAt = performance.now();
				}
			}
			if (state.readyAt === null) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}, selector);
}

/**
 * Read the visit's marks after two animation frames and a task, so the LCP
 * observer has delivered the ready paint; `takeRecords()` catches anything
 * still queued. Every value must exist: a missing mark is a harness bug, not a
 * zero to average.
 */
async function readMarks(page: Page, entry: PageEntry): Promise<Marks> {
	return page.evaluate(async (pageName: string) => {
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
		// A task boundary: PerformanceObserver records queued for the frame land.
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		// A named boundary rather than an inline cast: the probe is ours.
		const scope = window as unknown as {
			__pagePerf?: {
				state: { readyAt: number | null; lcp: number | null };
				observer: PerformanceObserver;
			};
		};
		const probe = scope.__pagePerf;
		if (!probe) throw new Error(`${pageName}: the perf probe did not run`);

		for (const record of probe.observer.takeRecords()) {
			probe.state.lcp = Math.max(probe.state.lcp ?? 0, record.startTime);
		}
		const { readyAt, lcp } = probe.state;
		if (readyAt === null) {
			throw new Error(`${pageName}: the ready selector never became visible`);
		}
		if (lcp === null) {
			throw new Error(`${pageName}: no largest-contentful-paint entry`);
		}
		const navigation = performance.getEntriesByType('navigation')[0] as
			| PerformanceNavigationTiming
			| undefined;
		if (!navigation) throw new Error(`${pageName}: no navigation timing entry`);

		return { ready: readyAt, lcp, ttfb: navigation.responseStart };
	}, baselineKey(entry));
}
