import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import { chatJson, llmConfigured, type JsonValue } from '$lib/server/services/llm';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import {
	extractReceiptRegex,
	normalizeLlmReceipt,
	RECEIPT_EXTRACTION_PROMPT
} from '$lib/server/services/receiptText';

/**
 * Collaborators injectable for tests (no real network, no real settings);
 * defaults wire production.
 */
export type ParseReceiptTextDeps = {
	chatJson: typeof chatJson;
	llmConfigured: typeof llmConfigured;
	/** The user's cloud-AI opt-out (userSettings.useCloudAI; default true). */
	getUseCloudAI: (userId: string) => Promise<boolean>;
	allowRequest: (request: Request) => boolean;
};

const defaultDeps: ParseReceiptTextDeps = {
	chatJson,
	llmConfigured,
	getUseCloudAI: async (userId) => {
		const settings = await getUserSettings(userId);
		return settings?.useCloudAI !== false;
	},
	allowRequest: (request) => rateLimit(clientKey(request, 'parse-receipt-text'), 20, 5 * 60_000)
};

/** Pastes are bounded hard: a 20KB receipt is generous, abuse is not. */
const MAX_TEXT_BYTES = 20 * 1024;

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Digital receipt text extraction (issue 033, paste/PDF paths): the client
 * sends already-extracted receipt text (pasted by the user or read from a
 * TEXT-LAYER PDF in-browser) and receives a normalized draft to prefill
 * the create form. A parse is a hint, never a commit — the user confirms
 * everything client-side. Cerebras is used only when the user's cloud-AI
 * opt-out allows AND the LLM is configured; otherwise (or on LLM failure)
 * the deterministic regex extractor answers.
 */
export const POST = async (
	event: RequestEvent,
	deps: ParseReceiptTextDeps = defaultDeps
): Promise<Response> => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	if (!deps.allowRequest(event.request)) {
		return json({ error: 'Too many imports. Try again shortly.' }, { status: 429 });
	}

	const body = await event.request.json().catch(() => null);
	// SAFETY: request JSON arrives untyped; these casts only recover the
	// single `text` field before it is validated as a bounded string.
	// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- boundary cast, justified above.
	if (!isNonEmptyString((body as { text?: unknown } | null)?.text)) {
		return json({ error: 'Send the receipt text to parse.' }, { status: 400 });
	}
	// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- boundary cast, justified above.
	const text = (body as { text: string }).text;
	if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) {
		return json({ error: 'Receipt text is too large (20KB max).' }, { status: 400 });
	}

	// Cloud path first (opt-out honored, anonymous callers never reach the
	// paid API); any LLM failure or unusable payload falls back to the
	// deterministic extractor — the draft always arrives.
	let draft = null;
	if ((await deps.getUseCloudAI(auth.user.id)) && deps.llmConfigured()) {
		// SAFETY: chatJson already parsed the completion; the assertion only
		// recovers the JsonValue type for normalizeLlmReceipt, which
		// re-validates every field before trusting it.
		const parsed = await deps.chatJson(RECEIPT_EXTRACTION_PROMPT, text);
		// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- boundary cast, justified above.
		draft = normalizeLlmReceipt(parsed as JsonValue | null);
	}
	if (!draft) draft = extractReceiptRegex(text);

	return json({ draft });
};
