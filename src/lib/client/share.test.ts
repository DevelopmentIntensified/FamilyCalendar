import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { copyOrShare } from './share';

/**
 * Issue 124 — one way to put a link in somebody else's hands.
 *
 * The app had five copy handlers, each with its own success state, its own
 * failure state and its own idea of what to tell the user. This suite is about
 * the ladder they now share: share where the platform has it, the clipboard
 * where it does not, a selection where neither exists (a non-secure origin has
 * no `navigator.clipboard` at all), and an honest outcome so a caller never
 * claims a copy it did not make.
 *
 * The globals are stubbed whole rather than patched, so this file runs in the
 * node project — the module reads `navigator`/`document` at call time and
 * nowhere else.
 */

const URL_TEXT = 'https://example.test/family/join/abc123';

/** Stand in for one rung of the ladder. Absent options mean the rung is missing. */
function env(opts: { share?: boolean; clipboard?: boolean; select?: boolean }): void {
	vi.stubGlobal(
		'navigator',
		opts.share ? { share: vi.fn(async () => undefined) } : {}
	);
	if (opts.clipboard) {
		// SAFETY: `navigator` is the stub installed two lines above, so this
		// object is exactly the two globals this suite describes.
		Object.assign(globalThis.navigator as object, {
			clipboard: { writeText: vi.fn(async () => undefined) }
		});
	}
	const field = { value: '', setAttribute: vi.fn(), style: {}, select: vi.fn() };
	vi.stubGlobal('document', {
		createElement: () => field,
		body: { appendChild: vi.fn(), removeChild: vi.fn() },
		execCommand: opts.select ? vi.fn(() => true) : undefined
	});
}

/** The stubbed share function, for assertions. */
function shareMock(): Mock<() => Promise<void>> {
	// SAFETY: `env()` installed exactly this shape on `navigator`.
	return (globalThis.navigator as unknown as { share: Mock<() => Promise<void>> }).share;
}

/** The stubbed clipboard writer, for assertions. */
function clipboardMock(): Mock<(text: string) => Promise<void>> {
	// SAFETY: `env()` installed exactly this shape on `navigator.clipboard`.
	const clipboard = (globalThis.navigator as unknown as {
		clipboard: { writeText: Mock<(text: string) => Promise<void>> };
	}).clipboard;
	return clipboard.writeText;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('copyOrShare — the platform sheet comes first', () => {
	it('shares where the platform has a share sheet and the caller wants one', async () => {
		env({ share: true, clipboard: true });

		expect(await copyOrShare(URL_TEXT, { share: true, title: 'Join our family' })).toBe('shared');
		expect(shareMock()).toHaveBeenCalledWith({ url: URL_TEXT, title: 'Join our family', text: undefined });
		expect(clipboardMock()).not.toHaveBeenCalled();
	});

	it('copies instead when there is no share sheet', async () => {
		env({ share: false, clipboard: true });

		expect(await copyOrShare(URL_TEXT, { share: true })).toBe('copied');
		expect(clipboardMock()).toHaveBeenCalledWith(URL_TEXT);
	});

	it('copies when the caller did not ask for a share', async () => {
		env({ share: true, clipboard: true });

		expect(await copyOrShare(URL_TEXT)).toBe('copied');
		expect(shareMock()).not.toHaveBeenCalled();
	});

	it('reports a share the person cancelled as cancelled, not as a failure', async () => {
		env({ share: true, clipboard: true });
		shareMock().mockRejectedValue(new DOMException('cancelled', 'AbortError'));

		// "Could not share — try again" is a lie when the person said no.
		expect(await copyOrShare(URL_TEXT, { share: true })).toBe('cancelled');
		expect(clipboardMock()).not.toHaveBeenCalled();
	});

	it('still copies when the share sheet itself breaks', async () => {
		env({ share: true, clipboard: true });
		shareMock().mockRejectedValue(new Error('not allowed'));

		expect(await copyOrShare(URL_TEXT, { share: true })).toBe('copied');
	});
});

describe('copyOrShare — an origin without the clipboard API', () => {
	it('selects the text so a manual copy still works', async () => {
		env({ select: true });

		expect(await copyOrShare(URL_TEXT)).toBe('copied');
		expect(document.execCommand).toHaveBeenCalledWith('copy');
	});

	it('falls back to selecting when the clipboard exists but is denied', async () => {
		env({ clipboard: true, select: true });
		clipboardMock().mockRejectedValue(new Error('denied'));

		expect(await copyOrShare(URL_TEXT)).toBe('copied');
		expect(document.execCommand).toHaveBeenCalledWith('copy');
	});

	it('says it failed rather than claiming a copy it did not make', async () => {
		env({});

		expect(await copyOrShare(URL_TEXT)).toBe('failed');
	});

	it('does not leave the throwaway field behind when the copy is refused', async () => {
		env({ select: true });
		vi.mocked(document.execCommand).mockReturnValue(false);

		expect(await copyOrShare(URL_TEXT)).toBe('failed');
		expect(document.body.removeChild).toHaveBeenCalled();
	});
});