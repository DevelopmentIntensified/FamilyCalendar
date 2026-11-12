import { describe, it, expect, vi } from 'vitest';
import { copyOrShare, type ShareEnvironment } from './shareText';

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
 * The browser globals arrive through the injectable environment, so this file
 * runs in the node project without stubbing anything.
 */

const URL_TEXT = 'https://example.test/family/join/abc123';

/** Stand in for one rung of the ladder. Absent options mean the rung is missing. */
function env(opts: { share?: boolean; clipboard?: boolean; select?: boolean }) {
	const share = vi.fn(async (_data?: unknown): Promise<void> => undefined);
	const writeText = vi.fn(async (_text: string): Promise<void> => undefined);
	const execCommand = vi.fn((_command: string) => true);
	const field = {
		value: '',
		setAttribute: vi.fn(),
		style: { position: '', opacity: '' },
		select: vi.fn()
	};
	const body = { appendChild: vi.fn(), removeChild: vi.fn() };
	const environment: ShareEnvironment = {
		navigator: {
			...(opts.share ? { share } : {}),
			...(opts.clipboard ? { clipboard: { writeText } } : {})
		},
		document: {
			createElement: () => field,
			body,
			execCommand: opts.select ? execCommand : undefined
		}
	};
	return { environment, share, writeText, execCommand, field, body };
}

describe('copyOrShare — the platform sheet comes first', () => {
	it('shares where the platform has a share sheet and the caller wants one', async () => {
		const { environment, share, writeText } = env({ share: true, clipboard: true });

		expect(
			await copyOrShare(URL_TEXT, { share: true, title: 'Join our family' }, environment)
		).toBe('shared');
		expect(share).toHaveBeenCalledWith({
			url: URL_TEXT,
			title: 'Join our family',
			text: undefined
		});
		expect(writeText).not.toHaveBeenCalled();
	});

	it('copies instead when there is no share sheet', async () => {
		const { environment, writeText } = env({ share: false, clipboard: true });

		expect(await copyOrShare(URL_TEXT, { share: true }, environment)).toBe('copied');
		expect(writeText).toHaveBeenCalledWith(URL_TEXT);
	});

	it('copies when the caller did not ask for a share', async () => {
		const { environment, share } = env({ share: true, clipboard: true });

		expect(await copyOrShare(URL_TEXT, {}, environment)).toBe('copied');
		expect(share).not.toHaveBeenCalled();
	});

	it('reports a share the person cancelled as cancelled, not as a failure', async () => {
		const { environment, share, writeText } = env({ share: true, clipboard: true });
		share.mockRejectedValue(new DOMException('cancelled', 'AbortError'));

		// "Could not share — try again" is a lie when the person said no.
		expect(await copyOrShare(URL_TEXT, { share: true }, environment)).toBe('cancelled');
		expect(writeText).not.toHaveBeenCalled();
	});

	it('still copies when the share sheet itself breaks', async () => {
		const { environment, share } = env({ share: true, clipboard: true });
		share.mockRejectedValue(new Error('not allowed'));

		expect(await copyOrShare(URL_TEXT, { share: true }, environment)).toBe('copied');
	});
});

describe('copyOrShare — an origin without the clipboard API', () => {
	it('selects the text so a manual copy still works', async () => {
		const { environment, execCommand, field } = env({ select: true });

		expect(await copyOrShare(URL_TEXT, {}, environment)).toBe('copied');
		expect(execCommand).toHaveBeenCalledWith('copy');
		expect(field.select).toHaveBeenCalled();
	});

	it('falls back to selecting when the clipboard exists but is denied', async () => {
		const { environment, writeText, execCommand } = env({ clipboard: true, select: true });
		writeText.mockRejectedValue(new Error('denied'));

		expect(await copyOrShare(URL_TEXT, {}, environment)).toBe('copied');
		expect(execCommand).toHaveBeenCalledWith('copy');
	});

	it('says it failed rather than claiming a copy it did not make', async () => {
		const { environment } = env({});

		expect(await copyOrShare(URL_TEXT, {}, environment)).toBe('failed');
	});

	it('does not leave the throwaway field behind when the copy is refused', async () => {
		const { environment, execCommand, body, field } = env({ select: true });
		execCommand.mockReturnValue(false);

		expect(await copyOrShare(URL_TEXT, {}, environment)).toBe('failed');
		expect(body.removeChild).toHaveBeenCalled();
		expect(field.value).toBe(URL_TEXT);
	});
});
