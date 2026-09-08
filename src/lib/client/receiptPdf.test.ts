import { describe, it, expect, vi } from 'vitest';
import { extractPdfTextFromPdf, pdfWorkerSrc, type PdfDoc } from './receiptPdf';

/** Builds a fake pdf.js document with the given per-page text. */
function fakeDoc(pages: string[]): PdfDoc {
	return {
		numPages: pages.length,
		getPage: async (i: number) => ({
			getTextContent: async () => ({
				items: pages[i - 1].split(' ').map((str) => ({ str }))
			})
		}),
		destroy: async () => {}
	};
}

describe('extractPdfTextFromPdf', () => {
	it('joins the text layer of every page in order', async () => {
		const getDocument = vi.fn(async () => fakeDoc(['Page one total 5.00', 'Page two']));
		const file = new File([new Uint8Array([1, 2, 3])], 'receipt.pdf', {
			type: 'application/pdf'
		});
		const text = await extractPdfTextFromPdf(file, { getDocument });
		expect(text).toBe('Page one total 5.00\nPage two');
		expect(getDocument).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.any(Uint8Array) })
		);
	});

	it('returns an empty string for an image-only (scanned) PDF', async () => {
		const getDocument = vi.fn(async () => fakeDoc(['', '']));
		const file = new File([new Uint8Array([9])], 'scan.pdf', { type: 'application/pdf' });
		const text = await extractPdfTextFromPdf(file, { getDocument });
		expect(text).toBe('');
	});

	it('propagates load failures as thrown errors (caller shows a notice)', async () => {
		const getDocument = vi.fn(async () => {
			throw new Error('corrupt');
		});
		const file = new File([new Uint8Array([9])], 'bad.pdf', { type: 'application/pdf' });
		await expect(extractPdfTextFromPdf(file, { getDocument })).rejects.toThrow('corrupt');
	});
});

describe('pdfWorkerSrc', () => {
	it('points at the pinned pdfjs-dist CDN worker', () => {
		expect(pdfWorkerSrc()).toMatch(
			/^https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@\d+\.\d+\.\d+\/build\/pdf\.worker\.min\.mjs$/
		);
	});
});
