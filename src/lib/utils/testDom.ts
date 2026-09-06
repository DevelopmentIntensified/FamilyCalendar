/**
 * Shared test helpers for DOM/fetch seams used across component tests.
 * Test-only: never imported by application code.
 */

/** Shape components actually read from `fetch` responses. */
type StubResponse<T = void> = {
	ok: true;
	json: () => Promise<T>;
};

/** Build a minimal fetch-shaped body for a JSON payload. */
export function fetchStub<T>(payload: T): StubResponse<T> {
	return { ok: true, json: () => Promise.resolve(payload) };
}

/**
 * Response-typed variant for `mockResolvedValue`.
 */
export function stubFetchResponse<T>(payload: T): Response {
	// SAFETY: the stub satisfies only the ok/json surface components read; the
	// Response cast is centralized here instead of every call site.
	return fetchStub(payload) as Response;
}

/** Narrows a DOM lookup to the expected element class or throws. */
export function asElementType<T extends HTMLElement>(el: Element, ctor: new () => T): T {
	if (el instanceof ctor) return el;
	throw new Error(`Expected ${ctor.name}, got ${el.constructor.name}`);
}

/** True when a fetch init body is a string payload. */
export function isStringBody(v: unknown): v is string {
	return typeof v === 'string';
}

/**
 * jsdom has no Touch constructors: dispatch a plain event carrying a
 * minimal TouchList via defineProperty.
 * SAFETY: handlers under test only read `touches`, which jsdom lacks on Event.
 */
export function dispatchTouchEvent(
	el: Element,
	type: 'touchstart' | 'touchmove' | 'touchend',
	touches: { identifier: number; target: Element; clientX: number; clientY: number }[]
): void {
	const ev = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(ev, 'touches', { value: touches });
	el.dispatchEvent(ev);
}
