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
import { RUNS } from './budgets';
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
		const first = await readVisit(page, bytes);
		// A network round trip, deliberately after the measurement window closed.
		await expectSignedIn(page, entry, seed);

		await gotoPage(page, entry, seed);
		const again = await readVisit(page, bytes);
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
		if (request.type === 'Document') bytes.html += event.encodedDataLength;
		if (request.type === 'Script') bytes.js += event.encodedDataLength;
		if (request.url.includes('__data.json')) bytes.data += event.encodedDataLength;
	});

	return { snapshot: () => ({ ...bytes }) };
}

/**
 * Mark the moment the catalog entry's `ready` selector becomes visible, and
 * keep the latest LCP entry, inside the document — Playwright's own wait adds
 * IPC latency, and the checks after the arrival must not stretch the window.
 * Init scripts run on every navigation, so the repeat visit gets its own mark.
 */
async function installReadyProbe(page: Page, selector: string): Promise<void> {
	await page.addInitScript((readySelector: string) => {
		const state: { readyAt: number | null; lcp: number } = { readyAt: null, lcp: 0 };
		// A named boundary rather than an inline cast: the probe is ours, the
		// window type is the browser's.
		const scope = window as unknown as { __pagePerf?: typeof state };
		scope.__pagePerf = state;

		new PerformanceObserver((entries) => {
			for (const entry of entries.getEntries()) state.lcp = Math.max(state.lcp, entry.startTime);
		}).observe({ type: 'largest-contentful-paint', buffered: true });

		const mark = () => {
			if (state.readyAt !== null) return true;
			const element = document.querySelector(readySelector);
			if (!element) return false;
			const rect = element.getBoundingClientRect();
			// The same visible test Playwright's waitFor uses: a box, not hidden.
			if (rect.width === 0 || rect.height === 0) return false;
			if (getComputedStyle(element).visibility === 'hidden') return false;
			state.readyAt = performance.now();
			return true;
		};

		if (mark()) return;
		// Data arriving is a DOM mutation; a layout-only appearance is a frame.
		const observer = new MutationObserver(() => {
			if (mark()) observer.disconnect();
		});
		observer.observe(document, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true
		});
		const tick = () => {
			if (!mark()) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}, selector);
}

/** The current document's marks and navigation timing, plus the byte totals. */
async function readVisit(page: Page, bytes: ByteCounter): Promise<Visit> {
	const timing = await page.evaluate(async () => {
		// One frame, so the LCP observer's callback for the ready paint ran.
		await new Promise(requestAnimationFrame);
		// A named boundary rather than an inline cast: the probe is ours.
		const scope = window as unknown as {
			__pagePerf?: { readyAt: number | null; lcp: number };
		};
		const probe = scope.__pagePerf;
		const navigation = performance.getEntriesByType('navigation')[0] as
			| PerformanceNavigationTiming
			| undefined;
		return {
			// A probe that never marked means our visible test and Playwright's
			// disagreed; report now rather than a hole.
			ready: probe?.readyAt ?? performance.now(),
			lcp: probe?.lcp ?? 0,
			ttfb: navigation?.responseStart ?? 0
		};
	});
	return { ...timing, ...bytes.snapshot() };
}
