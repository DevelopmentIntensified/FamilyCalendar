import { describe, it, expect, vi } from 'vitest';
import {
	cloudScanReceipt,
	scanReceiptWithFallback,
	scanWithEngines,
	stripExif,
	type ScanOutcome,
	type ScanEngine
} from './receiptOcr';

/** Engines that never fire — proves the chain stops at the first hit. */
const fail = vi.fn(async (): Promise<ScanOutcome | null> => null);

describe('scanWithEngines (OCR engine fallback chain, issue 010)', () => {
	const file = new File([new Uint8Array(4)], 'r.jpg', { type: 'image/jpeg' });

	it('returns the first engine that produces text', async () => {
		const first = vi.fn(async (): Promise<ScanOutcome> => ({ ok: true, text: 'ONE' }));
		const second = vi.fn(async (): Promise<ScanOutcome> => ({ ok: true, text: 'TWO' }));

		const result = await scanWithEngines([first, second], file);

		expect(result).toEqual({ ok: true, text: 'ONE' });
		expect(second).not.toHaveBeenCalled();
	});

	it('falls through engines that report unavailability (null)', async () => {
		const unavailable: ScanEngine = async () => null;
		const tesseract = vi.fn(async (): Promise<ScanOutcome> => ({ ok: true, text: 'OCR' }));

		const result = await scanWithEngines([unavailable, tesseract], file);

		expect(result).toEqual({ ok: true, text: 'OCR' });
	});

	it('falls through engines that throw (unavailable is not an error)', async () => {
		const throwing: ScanEngine = async () => {
			throw new Error('Prompt API missing');
		};
		const tesseract = vi.fn(async (): Promise<ScanOutcome> => ({ ok: true, text: 'OCR' }));

		const result = await scanWithEngines([throwing, tesseract], file);

		expect(result).toEqual({ ok: true, text: 'OCR' });
	});

	it('returns an empty failure when every engine declines', async () => {
		const result = await scanWithEngines([fail, fail], file);

		expect(result).toEqual({ ok: false, text: '' });
	});

	it('forwards progress to the engine that runs', async () => {
		const onProgress = vi.fn();
		const engine = vi.fn(async (_f: File, report: (p: number) => void) => {
			report(0.5);
			return { ok: true, text: 'OCR' };
		});

		await scanWithEngines([engine], file, onProgress);

		expect(onProgress).toHaveBeenCalledWith(0.5);
	});
});

/**
 * Synthetic JPEG: SOI + APP1(EXIF) + APP0(JFIF) + SOS + entropy data.
 * The test env has no canvas, so stripExif exercises the byte-wise APP1
 * fallback — the pin: no EXIF segment survives the strip.
 */
function jpegWithExif(): File {
	const exifPayload = 'Exif\0\0GPS-data-here'.split('').map((c) => c.charCodeAt(0));
	const app1Length = exifPayload.length + 2; // length bytes themselves included
	const app1 = [0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff, ...exifPayload];
	// Full JFIF APP0: marker + len(16) + 'JFIF\0' + version/units/density/thumb.
	const app0 = [
		0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
		0x00, 0x00
	];
	const sos = [0xff, 0xda, 0x00, 0x04, 0x01, 0x11, 0xde, 0xad, 0xbe, 0xef];
	const bytes = Uint8Array.from([0xff, 0xd8, ...app1, ...app0, ...sos]);
	return new File([bytes], 'r.jpg', { type: 'image/jpeg' });
}

describe('stripExif (cloud path preflight, issue 010)', () => {
	it('drops APP1/EXIF segments but keeps APP0 and the scan data', async () => {
		const stripped = await stripExif(jpegWithExif());
		const out = new Uint8Array(await stripped.arrayBuffer());

		expect(out[0]).toBe(0xff);
		expect(out[1]).toBe(0xd8);
		// No EXIF: no 0xFFE1 marker anywhere in the re-encoded buffer.
		for (let i = 0; i < out.length - 1; i++) {
			expect(out[i] === 0xff && out[i + 1] === 0xe1).toBe(false);
		}
		// JFIF APP0 and entropy data survive intact.
		expect([out[2], out[3]]).toEqual([0xff, 0xe0]);
		expect([out.at(-4), out.at(-3), out.at(-2), out.at(-1)]).toEqual([
			0xde,
			0xad,
			0xbe,
			0xef
		]);
	});

	it('passes non-JPEG files through unchanged (canvas handles those)', async () => {
		const png = new File([new Uint8Array([0x89, 0x50])], 'r.png', { type: 'image/png' });
		const stripped = await stripExif(png);
		expect(stripped).toBe(png);
	});
});

describe('cloudScanReceipt (opt-in Azure step, issue 010)', () => {
	const file = new File([new Uint8Array(4)], 'r.jpg', { type: 'image/jpeg' });
	const strip = async () => new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' });

	function jsonRes(payload: JsonBody, status = 200): Response {
		return new Response(JSON.stringify(payload), { status });
	}

	/** The two endpoint bodies these tests feed (scan payload or error). */
	interface JsonBody {
		scan?: object;
		error?: string;
	}

	const goodScan = {
		merchant: 'City Power',
		merchantConfidence: 0.98,
		totalCents: 12050,
		totalConfidence: 0.95,
		date: '2026-09-05',
		lineItems: [
			{ label: 'Electric usage', priceCents: 9850, confidence: null },
			{ label: null, priceCents: 100 }
		],
		category: 'utilities'
	};

	it('POSTs the stripped image to /api/scan-receipt and normalizes the scan', async () => {
		const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			void url;
			void init;
			return jsonRes({ scan: goodScan });
		});

		const scan = await cloudScanReceipt(file, { fetchFn, strip });

		const [url, init] = vi.mocked(fetchFn).mock.calls[0];
		expect(url).toBe('/api/scan-receipt');
		expect(init?.method).toBe('POST');
		const form = await new Request('http://x', { method: 'POST', body: init?.body }).formData();
		const sent = form.get('image');
		expect(sent).toBeInstanceOf(File);
		// SAFETY: the service constructs the File itself; the instanceof check
		// above pins the invariant this assertion relies on.
		expect((sent as File).name).toBe('receipt.jpg');
		expect(scan).toEqual({
			merchant: 'City Power',
			totalCents: 12050,
			date: '2026-09-05',
			lineItems: [{ label: 'Electric usage', priceCents: 9850 }],
			category: 'utilities'
		});
	});

	it('falls back to the other category and null line items on sparse data', async () => {
		const fetchFn = vi.fn(async () =>
			jsonRes({ scan: { merchant: 'M', totalCents: 500, date: null, category: 'nope' } })
		);

		const scan = await cloudScanReceipt(file, { fetchFn, strip });

		expect(scan).toEqual({
			merchant: 'M',
			totalCents: 500,
			date: null,
			lineItems: null,
			category: 'other'
		});
	});

	it('surfaces the route plain message on 429/502/503', async () => {
		const cases = [
			[429, 'Too many scans. Try again shortly.'],
			[502, 'Cloud scan failed (Azure returned 500).'],
			[503, 'Cloud scan is not available']
		] as const;
		for (const [status, message] of cases) {
			const fetchFn = vi.fn(async () => jsonRes({ error: message }, status));
			await expect(cloudScanReceipt(file, { fetchFn, strip })).rejects.toThrow(message);
		}
	});

	it('falls back to a generic message when the error body is not JSON', async () => {
		const fetchFn = vi.fn(async () => new Response('<html>', { status: 502 }));
		await expect(cloudScanReceipt(file, { fetchFn, strip })).rejects.toThrow(
			'Cloud scan is not available right now.'
		);
	});

	it('reports an unreachable service when fetch throws', async () => {
		const fetchFn = vi.fn(async () => {
			throw new Error('ECONNRESET');
		});
		await expect(cloudScanReceipt(file, { fetchFn, strip })).rejects.toThrow(
			'Cloud scan is unreachable. Try again.'
		);
	});
});

describe('scanReceiptWithFallback (local → opt-in cloud, issue 010)', () => {
	const file = new File([new Uint8Array(4)], 'r.jpg', { type: 'image/jpeg' });
	const cloudDeps = {
		fetchFn: vi.fn(async () => new Response('{}', { status: 200 })),
		strip: async () => new Blob([new Uint8Array(1)], { type: 'image/jpeg' })
	};
	const cloudFetch = vi.fn(
		async () =>
			new Response(
				JSON.stringify({
					scan: {
						merchant: 'City Power',
						totalCents: 12050,
						date: '2026-09-05',
						lineItems: null,
						category: 'utilities'
					}
				}),
				{ status: 200 }
			)
	);

	it('returns the local result untouched when quality is ok (no cloud call)', async () => {
		const runLocal = vi.fn(
			async (): Promise<ScanOutcome> => ({
				ok: true,
				text: 'CITY POWER\nTOTAL $120.00'
			})
		);

		const flow = await scanReceiptWithFallback(file, {
			runLocal,
			allowCloud: true,
			cloud: cloudDeps
		});

		expect(flow.quality).toBe('ok');
		expect(flow.local.merchant).toBe('CITY POWER');
		expect(flow.local.totalCents).toBe(12000);
		expect(flow.cloud).toBeUndefined();
	});

	it('does not send anything when cloud is not allowed, even on a poor scan', async () => {
		const runLocal = vi.fn(async (): Promise<ScanOutcome> => ({ ok: false, text: '' }));

		const flow = await scanReceiptWithFallback(file, { runLocal, cloud: cloudDeps });

		expect(flow.quality).toBe('poor');
		expect(flow.cloud).toBeUndefined();
	});

	it('merges the cloud scan into the same shape when opted in on a poor scan', async () => {
		// Letter-symbol junk: no merchant line, no total → poor quality.
		const runLocal = vi.fn(async (): Promise<ScanOutcome> => ({ ok: false, text: '*** ??' }));
		cloudFetch.mockClear();

		const flow = await scanReceiptWithFallback(file, {
			runLocal,
			allowCloud: true,
			cloud: { fetchFn: cloudFetch, strip: cloudDeps.strip }
		});

		expect(flow.quality).toBe('poor');
		expect(flow.cloud).toEqual({
			merchant: 'City Power',
			totalCents: 12050,
			date: '2026-09-05',
			lineItems: null,
			category: 'utilities'
		});
		expect(flow.cloudError).toBeUndefined();
	});

	it('carries a plain cloudError when the cloud step fails', async () => {
		const runLocal = vi.fn(async (): Promise<ScanOutcome> => ({ ok: false, text: '' }));

		const flow = await scanReceiptWithFallback(file, {
			runLocal,
			allowCloud: true,
			cloud: {
				fetchFn: vi.fn(
					async () => new Response(JSON.stringify({ error: 'nope' }), { status: 502 })
				),
				strip: cloudDeps.strip
			}
		});

		expect(flow.cloud).toBeUndefined();
		expect(flow.cloudError).toBe('nope');
	});

	it('treats merchant-less but total-bearing scans as ok', async () => {
		const runLocal = vi.fn(async (): Promise<ScanOutcome> => ({ ok: true, text: 'TOTAL $9.99' }));

		const flow = await scanReceiptWithFallback(file, {
			runLocal,
			allowCloud: true,
			cloud: cloudDeps
		});

		expect(flow.quality).toBe('ok');
		expect(flow.local.totalCents).toBe(999);
	});
});
