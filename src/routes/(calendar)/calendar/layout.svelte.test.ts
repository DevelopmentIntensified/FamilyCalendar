import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import { tick } from 'svelte';
import Layout from './+layout.svelte';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/state is a framework virtual module; no DI seam exists.
vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/calendar') }
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/stores is a framework virtual module (Navbar); no DI seam exists.
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/calendar') })
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/navigation is a framework virtual module; no DI seam exists.
vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateAll: vi.fn(() => Promise.resolve()),
	afterNavigate: vi.fn()
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- offline utils touch IndexedDB/navigator at import; the layout has no injection seam.
vi.mock('$lib/kernel/client/offlineQueue', () => ({
	initOfflineSync: () => () => {},
	isOnline: () => true,
	getPendingCount: () => Promise.resolve(0),
	subscribeToOnlineStatus: () => () => {}
}));

// jsdom has no ResizeObserver; Svelte's bind:clientHeight uses one. Capture
// callbacks so a test can "resize" the banner stack.
const observers: Array<() => void> = [];
beforeEach(() => {
	observers.length = 0;
	vi.stubGlobal(
		'ResizeObserver',
		class {
			cb: (entries: unknown[]) => void;
			targets: Element[] = [];
			constructor(cb: (entries: unknown[]) => void) {
				this.cb = cb;
				observers.push(() => this.cb(this.targets.map((target) => ({ target }))));
			}
			observe(t: Element) {
				this.targets.push(t);
			}
			unobserve() {}
			disconnect() {}
		}
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const unverified = {
	user: { id: 'u1', firstName: 'Sam', email: 'sam@example.com', emailVerified: false },
	userSettings: { timeZone: 'America/Chicago' }
} as never;

function bannerStack(): HTMLElement {
	const el = document.querySelector<HTMLElement>('[data-testid="calendar-banner-stack"]');
	if (!el) throw new Error('banner stack not found');
	return el;
}

// Issue 259: <main> got a fixed mt-10 whenever any banner showed, but the
// verify banner (and offline copy) are much taller at 375px, so the stack
// covered the calendar toolbar.
describe('(calendar)/calendar layout banner offset', () => {
	it('offsets main by the measured banner-stack height, not a fixed mt-10', async () => {
		render(Layout, { props: { data: unverified } });
		const stack = bannerStack();
		Object.defineProperty(stack, 'clientHeight', { configurable: true, value: 132 });
		observers.forEach((fire) => fire());
		await tick();
		const main = document.querySelector('main')!;
		expect(main.className).not.toMatch(/\bmt-10\b/);
		expect(main.style.marginTop).toBe('132px');
	});
});

// Issue 260: the verify form's inline row (~322px) overflowed 288px at 320px.
describe('(calendar)/calendar verify banner form', () => {
	it('wraps and lets the code input shrink', () => {
		render(Layout, { props: { data: unverified } });
		const input = document.querySelector<HTMLInputElement>('input[aria-label="Verification code"]')!;
		const form = input.closest('form')!;
		expect(form.className).toMatch(/\bflex-wrap\b/);
		expect(input.className).toMatch(/\bmin-w-0\b/);
		expect(input.className).not.toMatch(/(^|\s)w-40(\s|$)/);
	});
});
