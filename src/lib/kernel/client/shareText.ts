/**
 * Issue 124 — one way to put a link in somebody else's hands (moved from
 * legacy `client/share.ts`, task K-07).
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
 *
 * Doc: src/lib/kernel/README.md#client
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

/** The `navigator` surface the ladder uses; tests pass a fake. */
export interface ShareNavigator {
	share?: (data: { url?: string; title?: string; text?: string }) => Promise<void>;
	clipboard?: { writeText(text: string): Promise<void> };
}

/** The `document` surface the selection fallback uses; tests pass a fake. */
export interface ShareDocument {
	createElement(tag: string): unknown;
	body: { appendChild(node: unknown): void; removeChild(node: unknown): void };
	execCommand?: (command: string) => boolean;
}

/** The browser globals the ladder needs, injectable for tests and SSR. */
export interface ShareEnvironment {
	navigator?: ShareNavigator | null;
	document?: ShareDocument | null;
}

/** The throwaway textarea the selection fallback creates. */
interface CopyField {
	value: string;
	setAttribute(name: string, value: string): void;
	style: { position: string; opacity: string };
	select(): void;
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
function selectAndCopy(text: string, doc: ShareDocument | null): boolean {
	if (!doc) return false;
	const execCommand = doc.execCommand;
	if (typeof execCommand !== 'function') return false;
	try {
		// SAFETY: `createElement('textarea')` is the one tag this function asks for.
		const field = doc.createElement('textarea') as CopyField;
		field.value = text;
		field.setAttribute('readonly', '');
		field.style.position = 'fixed';
		field.style.opacity = '0';
		doc.body.appendChild(field);
		field.select();
		const ok = execCommand.call(doc, 'copy');
		doc.body.removeChild(field);
		return ok;
	} catch {
		return false;
	}
}

/** Build the document surface from the real global, when there is one. */
function defaultDocument(): ShareDocument | null {
	if (typeof document === 'undefined') return null;
	const doc = document;
	const execCommand = doc.execCommand;
	return {
		createElement: (tag) => doc.createElement(tag),
		body: {
			appendChild: (node) => {
				doc.body.appendChild(node as Node);
			},
			removeChild: (node) => {
				doc.body.removeChild(node as Node);
			}
		},
		execCommand:
			typeof execCommand === 'function'
				? (command) => execCommand.call(doc, command)
				: undefined
	};
}

export async function copyOrShare(
	text: string,
	options: CopyOptions = {},
	env: ShareEnvironment = {}
): Promise<CopyOutcome> {
	const nav: ShareNavigator | null =
		env.navigator !== undefined
			? env.navigator
			: typeof navigator === 'undefined'
				? null
				: navigator;

	if (nav && options.share && typeof nav.share === 'function') {
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

	if (nav && typeof nav.clipboard?.writeText === 'function') {
		try {
			await nav.clipboard.writeText(text);
			return 'copied';
		} catch {
			// Permission denied, or a document that is not focused. Try the
			// selection path rather than pretending it worked.
		}
	}

	const doc = env.document !== undefined ? env.document : defaultDocument();
	return selectAndCopy(text, doc) ? 'copied' : 'failed';
}
