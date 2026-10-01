/**
 * Issue 124 — one way to put a link in somebody else's hands.
 *
 * Five separate copy handlers existed across the app, each with its own success
 * state, its own failure state and its own idea of what to tell the person who
 * clicked. None of them used the platform share sheet, so inviting from a phone
 * meant copying a URL and pasting it into whatever the user was going to use
 * anyway.
 *
 * This is the one ladder every copy affordance goes through:
 *
 *   1. the platform share sheet, when there is one and the caller wants it —
 *      inviting is a send, not a copy-paste;
 *   2. the async clipboard, where there is one;
 *   3. selecting the text, on an origin without `navigator.clipboard`
 *      (anything served over plain http, which is a real deployment shape);
 *   4. `failed`, so the caller can say so rather than claim a copy it did not
 *      make.
 *
 * The caller owns the messaging; this owns the mechanics and the truthfulness
 * of the result. A person who cancels the share sheet is **not** a failure, and
 * that is the difference this type exists to carry.
 */

/** What actually happened. `cancelled` is a choice, not an error. */
export type CopyOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface CopyOptions {
	/** Prefer the platform share sheet where the platform has one. */
	share?: boolean;
	/** Title/body the share sheet offers, where it accepts them. */
	title?: string;
	text?: string;
}

/** A share the person dismissed. Not the same as a share that broke. */
function isAbort(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Select the text so a manual copy still works where the clipboard API is
 * absent. The old, widely-supported path: a throwaway textarea, selected,
 * `execCommand('copy')`, removed.
 */
function selectAndCopy(text: string): boolean {
	if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
	try {
		const field = document.createElement('textarea');
		field.value = text;
		field.setAttribute('readonly', '');
		field.style.position = 'fixed';
		field.style.opacity = '0';
		document.body.appendChild(field);
		field.select();
		const ok = document.execCommand('copy');
		document.body.removeChild(field);
		return ok;
	} catch {
		return false;
	}
}

export async function copyOrShare(text: string, options: CopyOptions = {}): Promise<CopyOutcome> {
	const nav: Partial<Navigator> | undefined = typeof navigator === 'undefined' ? undefined : navigator;

	if (options.share && typeof nav?.share === 'function') {
		try {
			await nav.share({ url: text, title: options.title, text: options.text });
			return 'shared';
		} catch (error) {
			// The person closed the sheet. Falling through to a copy would be
			// presumptuous, and reporting a failure would be a lie.
			if (isAbort(error)) return 'cancelled';
			// Any other share failure is the clipboard's problem to try.
		}
	}

	if (typeof nav?.clipboard?.writeText === 'function') {
		try {
			await nav.clipboard.writeText(text);
			return 'copied';
		} catch {
			// Permission denied, or a document that is not focused. Try the
			// selection path rather than pretending it worked.
		}
	}

	return selectAndCopy(text) ? 'copied' : 'failed';
}