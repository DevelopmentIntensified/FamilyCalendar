import { describe, it, expect, vi } from 'vitest';
import { scanWithEngines, type ScanOutcome, type ScanEngine } from './receiptOcr';

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
