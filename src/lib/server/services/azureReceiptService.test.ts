import { describe, it, expect, vi } from 'vitest';
import {
	analyzeReceiptWithAzure,
	AzureScanError,
	type AzureField,
	type AzureReceiptDeps
} from './azureReceiptService';

/** A minimal receipt image stand-in — the service only reads bytes. */
const IMAGE = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

/** Azure `analyze` document fields fixture (api-version 2023-07-31 shape). */
function receiptFields() {
	return {
		MerchantName: { valueString: 'City Power & Light', confidence: 0.98 },
		Total: { valueCurrency: { amount: 120.5, currencyCode: 'USD' }, confidence: 0.95 },
		TransactionDate: { valueDate: '2026-09-05', confidence: 0.93 },
		Items: {
			valueArray: [
				{
					valueObject: {
						Description: { valueString: 'Electric usage' },
						TotalPrice: { valueCurrency: { amount: 98.5 }, confidence: 0.9 }
					}
				},
				{
					valueObject: {
						Description: { valueString: 'Grid fee' },
						TotalPrice: { valueNumber: 22.0 }
					}
				}
			]
		}
	};
}

function succeededBody(fields: Record<string, AzureField>) {
	return JSON.stringify({
		status: 'succeeded',
		analyzeResult: { documents: [{ fields }] }
	});
}

/** A Response with the operation-location header Azure returns on 202. */
function accepted(operationLocation: string): Response {
	return new Response(null, {
		status: 202,
		headers: { 'operation-location': operationLocation }
	});
}

function jsonResponse(body: string, status = 200): Response {
	return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

/** deps with a scripted fetch queue (each call shifts the next response; the
 * last response repeats once the queue is exhausted — handy for "stays running"). */
function deps(
	responses: Array<Response | Error>,
	over: Partial<AzureReceiptDeps> = {}
): AzureReceiptDeps & { calls: Array<{ url: string; init?: RequestInit }> } {
	const queue = [...responses];
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		const next = queue.shift() ?? queue[queue.length - 1];
		if (!next) return new Response(null, { status: 500 });
		if (next instanceof Error) throw next;
		return next;
	});
	return {
		fetchFn,
		endpoint: 'https://example.cognitiveservices.azure.com/',
		apiKey: 'test-key',
		pollIntervalMs: 1,
		pollTimeoutMs: 500,
		calls,
		...over
	};
}

describe('analyzeReceiptWithAzure (issue 010 cloud scan, injected fetch)', () => {
	it('sends the image to prebuilt-receipt with the subscription key header', async () => {
		// Polls keep repeating the last "running" response until the deadline.
		const d = deps(
			[
				accepted('https://example.cognitiveservices.azure.com/op/1'),
				jsonResponse(JSON.stringify({ status: 'running' }))
			],
			{ pollTimeoutMs: 5, pollIntervalMs: 1 }
		);
		await expect(analyzeReceiptWithAzure(IMAGE, d)).rejects.toBeInstanceOf(AzureScanError);

		const first = d.calls[0];
		expect(first.url).toBe(
			'https://example.cognitiveservices.azure.com/formrecognizer/documentModels/prebuilt-receipt:analyze?api-version=2023-07-31'
		);
		expect(first.init?.method).toBe('POST');
		expect(new Headers(first.init?.headers).get('Ocp-Apim-Subscription-Key')).toBe('test-key');
		expect(new Headers(first.init?.headers).get('Content-Type')).toBe('application/octet-stream');
	});

	it('normalizes a successful receipt: merchant, total cents, date, items, category', async () => {
		const d = deps([
			accepted('https://example.cognitiveservices.azure.com/op/1'),
			jsonResponse(succeededBody(receiptFields()))
		]);

		const scan = await analyzeReceiptWithAzure(IMAGE, d);

		expect(scan).toEqual({
			merchant: 'City Power & Light',
			merchantConfidence: 0.98,
			totalCents: 12050,
			totalConfidence: 0.95,
			date: '2026-09-05',
			lineItems: [
				{ label: 'Electric usage', priceCents: 9850, confidence: 0.9 },
				{ label: 'Grid fee', priceCents: 2200, confidence: null }
			],
			category: 'utilities'
		});
	});

	it('202-polls the operation location until succeeded, then normalizes', async () => {
		const d = deps([
			accepted('https://example.cognitiveservices.azure.com/op/1'),
			jsonResponse(JSON.stringify({ status: 'running' })),
			jsonResponse(JSON.stringify({ status: 'notStarted' })),
			jsonResponse(succeededBody(receiptFields()))
		]);

		const scan = await analyzeReceiptWithAzure(IMAGE, d);

		expect(scan.totalCents).toBe(12050);
		expect(d.calls).toHaveLength(4);
		expect(d.calls[1].url).toBe('https://example.cognitiveservices.azure.com/op/1');
		expect(new Headers(d.calls[1].init?.headers).get('Ocp-Apim-Subscription-Key')).toBe('test-key');
	});

	it('throws a plain error when the analyze call fails (no key leak)', async () => {
		const d = deps([jsonResponse(JSON.stringify({ error: 'bad key' }), 401)]);

		const err = await analyzeReceiptWithAzure(IMAGE, d).catch((reason) => reason);

		expect(err).toBeInstanceOf(AzureScanError);
		// SAFETY: the instanceof check above pins the Error contract.
		const message = (err as Error).message;
		expect(message).toBe('Cloud scan failed (Azure returned 401).');
		expect(message).not.toContain('test-key');
	});

	it('throws a plain error when the operation reports failed', async () => {
		const d = deps([
			accepted('https://example.cognitiveservices.azure.com/op/1'),
			jsonResponse(JSON.stringify({ status: 'failed' }))
		]);

		await expect(analyzeReceiptWithAzure(IMAGE, d)).rejects.toThrow(
			'Cloud scan failed (Azure reported the operation failed).'
		);
	});

	it('throws a plain timeout error when the operation never completes', async () => {
		const d = deps(
			[
				accepted('https://example.cognitiveservices.azure.com/op/1'),
				jsonResponse(JSON.stringify({ status: 'running' }))
			],
			{ pollTimeoutMs: 5, pollIntervalMs: 1 }
		);

		await expect(analyzeReceiptWithAzure(IMAGE, d)).rejects.toThrow(
			'Cloud scan timed out. Try again.'
		);
	});

	it('surfaces network failures as a plain service error', async () => {
		const d = deps([new Error('ECONNRESET')]);

		await expect(analyzeReceiptWithAzure(IMAGE, d)).rejects.toThrow(
			'Cloud scan service is unreachable.'
		);
	});

	it('normalizes an empty receipt to nulls and the other category', async () => {
		const d = deps([
			accepted('https://example.cognitiveservices.azure.com/op/1'),
			jsonResponse(succeededBody({}))
		]);

		const scan = await analyzeReceiptWithAzure(IMAGE, d);

		expect(scan).toEqual({
			merchant: null,
			merchantConfidence: null,
			totalCents: null,
			totalConfidence: null,
			date: null,
			lineItems: null,
			category: 'other'
		});
	});
});
