/**
 * Azure Document Intelligence prebuilt-receipt adapter (issue 010 — the
 * opt-in cloud step of the OCR fallback chain). Pure HTTP over an INJECTED
 * fetch: the route passes endpoint + key + fetchFn, so tests are
 * table-driven against a scripted fetch with zero real network and the
 * key never appears in a message.
 *
 * Privacy posture (#029): Azure auto-deletes the submitted image and its
 * results within 24h and never trains on customer content; we keep
 * nothing — the normalized scan is returned and the bytes are dropped.
 */
import { suggestCategory, type BillCategory } from '$lib/utils/receiptScan';

export interface AzureReceiptDeps {
	fetchFn: typeof fetch;
	/** Azure resource endpoint, e.g. https://example.cognitiveservices.azure.com */
	endpoint: string;
	apiKey: string;
	/** Poll cadence for the operation-location (default 1s). */
	pollIntervalMs?: number;
	/** Overall ceiling for the analyze operation (default 30s). */
	pollTimeoutMs?: number;
}

/** One recognized line item, cents-normalized like the local scan. */
export interface AzureReceiptLineItem {
	label: string;
	priceCents: number;
	confidence: number | null;
}

/**
 * The cloud scan normalized to the SAME shape as the local scan
 * (merchant/total/date/category) plus line items and Azure confidence
 * passthrough.
 */
export interface AzureReceiptScan {
	merchant: string | null;
	merchantConfidence: number | null;
	totalCents: number | null;
	totalConfidence: number | null;
	date: string | null;
	lineItems: AzureReceiptLineItem[] | null;
	category: BillCategory;
}

/** Plain-message failure; the route maps it to a 502 verbatim. */
export class AzureScanError extends Error {}

/** One field of an analyze document (api-version 2023-07-31 shapes). */
export interface AzureField {
	valueString?: string;
	valueNumber?: number;
	valueDate?: string;
	valueCurrency?: { amount?: number };
	valueArray?: Array<{ valueObject?: Record<string, AzureField> }>;
	confidence?: number;
}

const API_VERSION = '2023-07-31';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Type guards: typeof narrowing is allowed only in predicate position. */
function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
function isNonEmptyText(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}
function isIsoDate(value: unknown): value is string {
	return typeof value === 'string' && DATE_RE.test(value);
}

/** Cents from a currency-or-number Azure field; null when absent/invalid. */
function fieldToCents(field: AzureField | undefined): number | null {
	if (!field) return null;
	const amount = field.valueCurrency?.amount ?? field.valueNumber;
	return isFiniteNumber(amount) ? Math.round(amount * 100) : null;
}

function fieldToString(field: AzureField | undefined): string | null {
	const value = field?.valueString;
	return isNonEmptyText(value) ? value.trim() : null;
}

function fieldToDate(field: AzureField | undefined): string | null {
	const value = field?.valueDate;
	return isIsoDate(value) ? value : null;
}

function fieldConfidence(field: AzureField | undefined): number | null {
	return isFiniteNumber(field?.confidence) ? field.confidence : null;
}

function normalizeItems(items: AzureField | undefined): AzureReceiptLineItem[] | null {
	const entries = items?.valueArray;
	if (!Array.isArray(entries) || entries.length === 0) return null;
	const lineItems: AzureReceiptLineItem[] = [];
	for (const entry of entries) {
		const object = entry.valueObject;
		if (!object) continue;
		const label = fieldToString(object.Description);
		if (!label) continue;
		lineItems.push({
			label,
			priceCents: fieldToCents(object.TotalPrice) ?? 0,
			confidence: fieldConfidence(object.TotalPrice)
		});
	}
	return lineItems.length > 0 ? lineItems : null;
}

function normalizeDocument(fields: Record<string, AzureField>): AzureReceiptScan {
	const merchant = fieldToString(fields.MerchantName);
	const totalCents = fieldToCents(fields.Total);
	const date = fieldToDate(fields.TransactionDate);
	const lineItems = normalizeItems(fields.Items);
	// Bill category is MERCHANT-derived (#031): line-item labels (a "grid
	// fee", a "sales tax" line) must never absorb the bill's category —
	// they get their own Line Item Labels instead.
	const categoryInput = merchant ?? '';
	return {
		merchant,
		merchantConfidence: fieldConfidence(fields.MerchantName),
		totalCents,
		totalConfidence: fieldConfidence(fields.Total),
		date,
		lineItems,
		category: suggestCategory(categoryInput)
	};
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface OperationBody {
	status?: string;
	analyzeResult?: { documents?: Array<{ fields?: Record<string, AzureField> }> };
}

export async function analyzeReceiptWithAzure(
	image: Blob,
	deps: AzureReceiptDeps
): Promise<AzureReceiptScan> {
	const { fetchFn, endpoint, apiKey, pollIntervalMs = 1000, pollTimeoutMs = 30_000 } = deps;
	const base = endpoint.replace(/\/+$/, '');
	const analyzeUrl = `${base}/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=${API_VERSION}`;

	let analyzeRes: Response;
	try {
		analyzeRes = await fetchFn(analyzeUrl, {
			method: 'POST',
			headers: {
				'Ocp-Apim-Subscription-Key': apiKey,
				'Content-Type': 'application/octet-stream'
			},
			body: await image.arrayBuffer()
		});
	} catch {
		throw new AzureScanError('Cloud scan service is unreachable.');
	}

	if (!analyzeRes.ok) {
		throw new AzureScanError(`Cloud scan failed (Azure returned ${analyzeRes.status}).`);
	}

	const operationLocation = analyzeRes.headers.get('operation-location');
	if (!operationLocation) {
		throw new AzureScanError('Cloud scan failed (Azure returned no operation location).');
	}

	const deadline = Date.now() + pollTimeoutMs;
	for (;;) {
		if (Date.now() > deadline) {
			throw new AzureScanError('Cloud scan timed out. Try again.');
		}
		await sleep(pollIntervalMs);

		let pollRes: Response;
		let body: OperationBody;
		try {
			pollRes = await fetchFn(operationLocation, {
				headers: { 'Ocp-Apim-Subscription-Key': apiKey }
			});
			// SAFETY: json() is typed any at the HTTP boundary; the narrow
			// OperationBody contract (status/analyzeResult) is asserted below.
			body = (await pollRes.json()) as OperationBody;
		} catch {
			throw new AzureScanError('Cloud scan service is unreachable.');
		}
		if (!pollRes.ok) {
			throw new AzureScanError(`Cloud scan failed (Azure returned ${pollRes.status}).`);
		}

		if (body.status === 'succeeded') {
			const fields = body.analyzeResult?.documents?.[0]?.fields;
			return normalizeDocument(fields ?? {});
		}
		if (body.status === 'failed') {
			throw new AzureScanError('Cloud scan failed (Azure reported the operation failed).');
		}
		// notStarted/running: keep polling until the deadline.
	}
}
