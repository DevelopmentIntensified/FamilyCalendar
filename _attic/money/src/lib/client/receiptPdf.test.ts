import { describe, it, expect, vi } from 'vitest';
import {
	extractPdfTextFromPdf,
	importReceiptPdf,
	pdfWorkerSrc,
	PDF_IMPORT_PAGE_CAP,
	type PdfCanvas,
	type PdfDoc,
	type ReceiptPdfDeps
} from './receiptPdf';
import type { ScanOutcome } from './receiptOcr';

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

// ── importReceiptPdf: auto-OCR fallback + reason-specific results (#033) ──

/**
 * A minimal VALID single-page text-layer PDF built from raw bytes (no
 * pdfjs fixtures on disk): classic 5-object layout with a computed xref.
 */
function minimalTextPdf(text: string): Uint8Array {
	const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
	const objects = [
		'1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
		'2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
		'3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
		`4 0 obj << /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`,
		'5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj'
	];
	let body = '%PDF-1.4\n';
	const offsets: number[] = [];
	for (const obj of objects) {
		offsets.push(body.length);
		body += `${obj}\n`;
	}
	const xrefStart = body.length;
	body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
	body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
	return new TextEncoder().encode(body);
}

/** A pdf.js page mock with text extraction AND render support (OCR path). */
interface PageSpec {
	/** Text-layer characters; a page with <20 chars counts as a scan. */
	text?: string;
	/** What the (mocked) OCR chain reads off the rendered page. */
	ocr?: string;
	/** Make render throw to simulate a canvas/render failure. */
	renderThrows?: boolean;
}

function ocrCapableDoc(specs: PageSpec[]): PdfDoc {
	return {
		numPages: specs.length,
		getPage: async (i: number) => {
			const spec = specs[i - 1];
			return {
				getTextContent: async () => ({
					items: (spec.text ?? '')
						.split(' ')
						.filter(Boolean)
						.map((str) => ({ str }))
				}),
				getViewport: ({ scale }: { scale: number }) => ({
					width: 612 * scale,
					height: 792 * scale
				}),
				render: () => {
					if (spec.renderThrows) throw new Error('render failed');
					return { promise: Promise.resolve() };
				},
				cleanup: () => {}
			};
		},
		destroy: async () => {}
	};
}

/** Canvas / canvas→File / OCR fakes injected so tests never touch pixels. */
function ocrDeps(specs: PageSpec[]) {
	const ocrImage = vi.fn(async (file: File): Promise<ScanOutcome> => {
		const index = Number(file.name.match(/page-(\d+)/)?.[1] ?? 1) - 1;
		return { ok: true, text: specs[index]?.ocr ?? '' };
	});
	const createCanvas = vi.fn(
		(width: number, height: number): PdfCanvas => ({
			width,
			height,
			// SAFETY: the fake render target never draws — the injected OCR fake
			// ignores the context entirely, so an empty object satisfies the seam.
			// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- fake-canvas context, justified above.
			getContext: () => ({}) as CanvasRenderingContext2D,
			toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' }))
		})
	);
	const canvasToFile = vi.fn(async (canvas: PdfCanvas, page: number) => {
		void canvas;
		return new File([`p${page}`], `page-${page}.png`, { type: 'image/png' });
	});
	return { ocrImage, createCanvas, canvasToFile };
}

function pdfFile(bytes: Uint8Array): File {
	return new File([bytes], 'receipt.pdf', { type: 'application/pdf' });
}

describe('importReceiptPdf — text-layer PDFs', () => {
	it('reads a REAL text-layer PDF (raw-bytes fixture) with no OCR attempt', async () => {
		// Real pdfjs (legacy build — the CDN loader is browser-only) proves the
		// fixture is a genuinely valid PDF, not just a mock agreeing with itself.
		const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
		// SAFETY: the legacy build models the full pdf.js API; PDFDocumentProxy
		// structurally satisfies the narrower PdfDoc subset this module touches.
		const getDocument: ReceiptPdfDeps['getDocument'] = async (src) => {
			const proxy = await pdfjs.getDocument(src).promise;
			// SAFETY: PDFDocumentProxy structurally satisfies the PdfDoc subset
			// (numPages/getPage/destroy); the cast only drops the wider surface.
			return proxy as PdfDoc;
		};
		const deps = { ...ocrDeps([]), getDocument };
		const result = await importReceiptPdf(
			pdfFile(minimalTextPdf('GROCERY MART TOTAL 12.50')),
			deps
		);
		expect(result.status).toBe('ok');
		expect(result.text).toContain('TOTAL 12.50');
		expect(result.ocrUsed).toBe(false);
		expect(deps.ocrImage).not.toHaveBeenCalled();
	});

	it('passes a mostly-empty text layer through with ok status (parse decides)', async () => {
		// Text ≥ threshold chars but meaningless content — not the importer's call.
		const deps = ocrDeps([]);
		const result = await importReceiptPdf(pdfFile(new Uint8Array([1])), {
			...deps,
			getDocument: async () => fakeDoc(['some short line worth parsing anyway'])
		});
		expect(result.status).toBe('ok');
		expect(result.ocrUsed).toBe(false);
	});
});

describe('importReceiptPdf — image-only and mixed PDFs', () => {
	it('auto-OCRs an image-only PDF (mock: empty text, renderable pages)', async () => {
		const deps = ocrDeps([
			{ text: '', ocr: 'CITY POWER TOTAL 120.00' },
			{ text: '', ocr: 'page two stuff' }
		]);
		const result = await importReceiptPdf(pdfFile(new Uint8Array([9])), {
			...deps,
			getDocument: async () => ocrCapableDoc([{ text: '' }, { text: '' }])
		});
		expect(result.status).toBe('ok');
		expect(result.ocrUsed).toBe(true);
		expect(result.text).toBe('CITY POWER TOTAL 120.00\npage two stuff');
		expect(deps.ocrImage).toHaveBeenCalledTimes(2);
		expect(deps.createCanvas).toHaveBeenCalledTimes(2);
	});

	it('concatenates text pages and OCR pages for a MIXED PDF, in page order', async () => {
		// OCR fake is indexed by page number: page 1 is text, page 2 the scan.
		const deps = ocrDeps([{}, { ocr: 'OCR PAGE TWO' }]);
		const result = await importReceiptPdf(pdfFile(new Uint8Array([9])), {
			...deps,
			getDocument: async () =>
				ocrCapableDoc([{ text: 'Text layer page one with plenty of characters' }, { text: '' }])
		});
		expect(result.status).toBe('ok');
		expect(result.ocrUsed).toBe(true);
		expect(result.text).toBe('Text layer page one with plenty of characters\nOCR PAGE TWO');
		expect(deps.ocrImage).toHaveBeenCalledTimes(1);
	});

	it('OCR progress reaches the caller through onNote (auto-OCR is visible)', async () => {
		const notes: string[] = [];
		const deps = ocrDeps([{ text: '', ocr: 'something' }]);
		await importReceiptPdf(
			pdfFile(new Uint8Array([9])),
			{
				...deps,
				getDocument: async () => ocrCapableDoc([{ text: '' }])
			},
			(note) => notes.push(note)
		);
		expect(notes.some((note) => note.includes('OCR'))).toBe(true);
	});
});

describe('importReceiptPdf — failures with reasons', () => {
	it('classifies a PasswordException mock as password-protected', async () => {
		const getDocument = vi.fn(async () => {
			throw Object.assign(new Error('No password given'), { name: 'PasswordException' });
		});
		const result = await importReceiptPdf(pdfFile(new Uint8Array([9])), {
			...ocrDeps([]),
			getDocument
		});
		expect(result.status).toBe('password');
	});

	it('classifies generic load failures as open-failed', async () => {
		const getDocument = vi.fn(async () => {
			throw new Error('Invalid PDF structure');
		});
		const result = await importReceiptPdf(pdfFile(new Uint8Array([9])), {
			...ocrDeps([]),
			getDocument
		});
		expect(result.status).toBe('open-failed');
	});

	it('classifies CDN worker failures as worker-failed', async () => {
		const getDocument = vi.fn(async () => {
			throw new Error('Setting up fake worker failed to load worker');
		});
		const result = await importReceiptPdf(pdfFile(new Uint8Array([9])), {
			...ocrDeps([]),
			getDocument
		});
		expect(result.status).toBe('worker-failed');
	});

	it('OCR that reads nothing back-to-back yields unreadable (no dead end)', async () => {
		const deps = ocrDeps([{ text: '', ocr: '' }]);
		const result = await importReceiptPdf(pdfFile(new Uint8Array([9])), {
			...deps,
			getDocument: async () => ocrCapableDoc([{ text: '' }])
		});
		expect(result.status).toBe('unreadable');
		expect(result.text).toBe('');
	});

	it('a page whose render fails is skipped, other pages still read', async () => {
		const deps = ocrDeps([
			{ text: '', ocr: '' },
			{ text: '', ocr: 'RECOVERED PAGE' }
		]);
		const result = await importReceiptPdf(pdfFile(new Uint8Array([9])), {
			...deps,
			getDocument: async () => ocrCapableDoc([{ text: '', renderThrows: true }, { text: '' }])
		});
		expect(result.status).toBe('ok');
		expect(result.text).toBe('RECOVERED PAGE');
	});
});

describe('importReceiptPdf — large PDFs (page cap)', () => {
	it('processes only the first PDF_IMPORT_PAGE_CAP pages and flags the skip', async () => {
		const specs: PageSpec[] = Array.from({ length: 8 }, (_, i) => ({
			text: `Page number ${i + 1} with a full line of receipt text`
		}));
		const deps = ocrDeps(specs);
		const result = await importReceiptPdf(pdfFile(new Uint8Array([9])), {
			...deps,
			getDocument: async () => ocrCapableDoc(specs)
		});
		expect(PDF_IMPORT_PAGE_CAP).toBe(5);
		expect(result.pagesProcessed).toBe(5);
		expect(result.pagesTotal).toBe(8);
		expect(result.pagesSkipped).toBe(true);
		expect(result.text).not.toContain('Page number 6');
	});
});
