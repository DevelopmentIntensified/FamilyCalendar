/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unknown-returns, anti-slop/no-known-value-widening -- webhook boundary: Resend email.received JSON arrives untyped; every field is validated, defaulted, or dropped before use. */
import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { verifySvixSignature, type SvixHeaders } from '$lib/server/utils/svixVerify';
import { chatJson, llmConfigured, type JsonValue } from '$lib/server/services/llm';
import {
	normalizeLlmReceipt,
	extractReceiptRegex,
	RECEIPT_EXTRACTION_PROMPT
} from '$lib/server/services/receiptText';
import { extractPdfText } from '$lib/server/services/pdfText';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import {
	createBill,
	parseDueDate,
	setBillItems,
	type BillItemInput
} from '$lib/server/db/actions/bills';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { findUserIdByIngestToken, isValidIngestToken } from '$lib/server/db/actions/receiptIngest';
import { BILL_CATEGORIES } from '$lib/server/db/schema';

/**
 * Resend Inbound webhook (issue 033): `email.received` events carrying the
 * parsed email body + base64 attachments. The ingest address
 * `receipts.<token>@<RECEIPT_INGEST_DOMAIN>` routes the mail to one user;
 * nothing else about the sender matters. The outcome is ALWAYS a draft
 * bill (bills.source = 'email', paidAt null): never auto-saved as a real
 * bill, never counted as spent, never trains the Tag Table — the user
 * confirms, edits, or deletes it on the bills page.
 *
 * PDF attachments are text-extracted at webhook time and the bytes are
 * dropped — no received file is ever persisted by us (Resend retains the
 * mail server-side; disclosed in the privacy policy).
 */

/** Collaborators injectable for tests; defaults wire production. */
export type EmailIngestDeps = {
	/** Svix signature check over the RAW request body. */
	verify: (headers: SvixHeaders, payload: string) => boolean;
	findUserByToken: typeof findUserIdByIngestToken;
	getUseCloudAI: (userId: string) => Promise<boolean>;
	chatJson: typeof chatJson;
	llmConfigured: typeof llmConfigured;
	extractPdfText: (pdf: Buffer) => Promise<string>;
	getUserFamilyId: typeof getUserFamilyId;
	createBill: typeof createBill;
	setBillItems: typeof setBillItems;
};

const defaultDeps: EmailIngestDeps = {
	verify: (headers, payload) => {
		const secret = process.env.RESEND_WEBHOOK_SECRET;
		return secret ? verifySvixSignature(headers, payload, secret) : false;
	},
	findUserByToken: findUserIdByIngestToken,
	getUseCloudAI: async (userId) => {
		const settings = await getUserSettings(userId);
		return settings?.useCloudAI !== false;
	},
	chatJson,
	llmConfigured,
	extractPdfText,
	getUserFamilyId,
	createBill,
	setBillItems
};

/** The receipts.<token> local-part of an ingest address → token. */
function ingestTokenFromAddress(to: unknown): string | null {
	const addresses = Array.isArray(to) ? to : [to];
	for (const entry of addresses) {
		if (typeof entry !== 'string') continue;
		const [localPart] = entry.split('@');
		if (!localPart?.startsWith('receipts.')) continue;
		const token = localPart.slice('receipts.'.length).toLowerCase();
		if (isValidIngestToken(token)) return token;
	}
	return null;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary parser: webhook JSON arrives untyped; every field is validated before use.
function receivedBody(json: unknown): {
	to: unknown;
	text: string | null;
	html: string | null;
	subject: string | null;
	attachments: unknown;
} | null {
	if (typeof json !== 'object' || json === null) return null;
	const record = json as Record<string, unknown>;
	if (record.type !== 'email.received') return null;
	if (typeof record.data !== 'object' || record.data === null) return null;
	const data = record.data as Record<string, unknown>;
	return {
		to: data.to,
		text: typeof data.text === 'string' ? data.text : null,
		html: typeof data.html === 'string' ? data.html : null,
		subject: typeof data.subject === 'string' ? data.subject : null,
		attachments: data.attachments
	};
}

/** First PDF attachment's bytes; null when the mail carries no PDF. */
function firstPdfAttachment(attachments: unknown): Buffer | null {
	if (!Array.isArray(attachments)) return null;
	for (const entry of attachments) {
		if (typeof entry !== 'object' || entry === null) continue;
		const att = entry as Record<string, unknown>;
		const contentType = att.content_type ?? att.contentType;
		const isPdf =
			contentType === 'application/pdf' ||
			(typeof att.filename === 'string' && att.filename.toLowerCase().endsWith('.pdf'));
		if (!isPdf || typeof att.content !== 'string') continue;
		const pdf = Buffer.from(att.content, 'base64');
		if (pdf.length > 0) return pdf;
	}
	return null;
}

/** Crude HTML→text for mail bodies that carry no text part. */
function stripHtml(html: string): string {
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();
}

function isBillCategory(value: unknown): boolean {
	return typeof value === 'string' && (BILL_CATEGORIES as readonly string[]).includes(value);
}

/** Draft items from a normalized extraction (validated, ≤50, capped). */
function draftItems(
	items: ReturnType<typeof normalizeLlmReceipt> extends null
		? never
		: NonNullable<ReturnType<typeof normalizeLlmReceipt>>['items']
): BillItemInput[] {
	return items.slice(0, 50).map((item) => ({
		label: item.label.slice(0, 100),
		priceCents: item.priceCents,
		category: isBillCategory(item.category) ? item.category : null,
		name: null
	}));
}

export const POST = async (
	event: RequestEvent,
	deps: EmailIngestDeps = defaultDeps
): Promise<Response> => {
	// Capability gate first: without the webhook secret the endpoint is off.
	if (!process.env.RESEND_WEBHOOK_SECRET) {
		return json({ error: 'Email ingest is not configured' }, { status: 503 });
	}

	// Svix verification needs the EXACT raw body — read text, not json().
	const payload = await event.request.text();
	if (!deps.verify(event.request.headers, payload)) {
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	const parsed = receivedBody(safeJson(payload));
	// Any non-received event or malformed payload is acked 200 so Resend
	// does not retry it forever.
	if (!parsed) return json({ ok: true, ignored: true });

	const token = ingestTokenFromAddress(parsed.to);
	if (!token) return json({ ok: true, ignored: true });
	const userId = await deps.findUserByToken(token);
	if (!userId) {
		// Unknown token: acked (no retry storm), nothing created.
		return json({ ok: true, ignored: true });
	}

	// Content preference: plain-text body → PDF attachment → HTML body.
	let receiptText = parsed.text?.trim() || null;
	if (!receiptText) {
		const pdf = firstPdfAttachment(parsed.attachments);
		if (pdf) {
			try {
				const extracted = await deps.extractPdfText(pdf);
				if (extracted.trim()) receiptText = extracted;
			} catch (error) {
				console.error('[email-ingest] pdf extraction failed:', error);
			}
		}
	}
	if (!receiptText && parsed.html) receiptText = stripHtml(parsed.html);
	if (!receiptText) return json({ ok: true, ignored: true });

	// Same extraction pipeline as paste/PDF: LLM when allowed + configured,
	// deterministic regex fallback otherwise. Category must be in the closed
	// vocabulary or null (inherit).
	const useCloud = (await deps.getUseCloudAI(userId)) && deps.llmConfigured();
	const extraction = useCloud
		? normalizeLlmReceipt(
				(await deps.chatJson(RECEIPT_EXTRACTION_PROMPT, receiptText)) as JsonValue | null
			)
		: null;
	const draft = extraction ?? extractReceiptRegex(receiptText);

	const familyId = await deps.getUserFamilyId(userId);
	const dueDate = draft.date === null ? { status: 'ok', value: null } : parseDueDate(draft.date);
	const created = await deps.createBill({
		title:
			(draft.merchant ?? parsed.subject ?? 'Emailed receipt').slice(0, 120).trim() ||
			'Emailed receipt',
		amountCents: draft.totalCents ?? 0,
		dueDate: dueDate.status === 'ok' ? dueDate.value : null,
		category: 'other',
		userId,
		familyId,
		source: 'email'
	});
	if (draft.items.length > 0) {
		await deps.setBillItems(created.id, draftItems(draft.items));
	}

	// Draft only — training runs on CONFIRM (bills/[id] route), never here.
	return json({ ok: true, billId: created.id });
};

function safeJson(payload: string): unknown {
	try {
		return JSON.parse(payload);
	} catch {
		return null;
	}
}
