/**
 * Client-side PDF receipt import (issue 033, v1b + v2 hardening).
 * pdf.js (pdfjs-dist, pinned) runs in the browser via a lazy dynamic
 * import — the dependency and its ~1MB worker are only fetched when a
 * user actually imports a PDF. The PDF file itself never leaves the
 * device; only extracted text goes to the parse endpoint (same as
 * quick-add, disclosed).
 *
 * v2: image-only (scanned) PDFs are no longer a dead end. Pages with
 * (near-)empty text layers are rendered to canvas and run through the
 * EXISTING on-device OCR chain (receiptOcr.ts), then concatenated with
 * any text-layer pages in page order. Failures are classified so the
 * caller can show a REASON-specific message (password / corrupt /
 * worker-blocked / OCR unreadable) instead of a generic one.
 */

/** The pinned pdfjs-dist version (single source of truth with the server). */
import { pdfjsVersion } from '$lib/utils/pdfVersion';
import { scanReceiptImage, type ScanOutcome } from '$lib/client/receiptOcr';

/** The subset of the pdf.js API this module touches. */
export interface PdfPageLike {
	getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
	/** Render surface — present on real pdf.js pages, optional in mocks. */
	getViewport?(params: { scale: number }): { width: number; height: number };
	render?(params: {
		canvasContext: CanvasRenderingContext2D;
		viewport: { width: number; height: number };
	}): { promise: Promise<void> };
	/** Frees the page's GPU/memory buffers (pdf.js recommends after render). */
	cleanup?(): void;
}

export interface PdfDoc {
	numPages: number;
	getPage(page: number): Promise<PdfPageLike>;
	destroy(): Promise<void>;
}

export type PdfGetDocument = (src: {
	data: Uint8Array;
	isEvalSupported: boolean;
}) => Promise<PdfDoc>;

/** Structural canvas subset used for rendering (real or injected fake). */
export interface PdfCanvas {
	width: number;
	height: number;
	// SAFETY: only the '2d' context is ever requested; the loose signature
	// keeps real HTMLCanvasElement assignable to this structural subset.
	getContext(contextId?: string): CanvasRenderingContext2D | null;
	toBlob(callback: (blob: Blob | null) => void, type?: string): void;
}

export type ReceiptPdfDeps = {
	getDocument?: PdfGetDocument;
};

/** Extra seams for the OCR fallback (injectable — tests never touch pixels). */
export interface PdfImportDeps extends ReceiptPdfDeps {
	/** The on-device OCR chain for one rendered page (default scanReceiptImage). */
	ocrImage?: (file: File) => Promise<ScanOutcome>;
	/** Creates the render target canvas (default document.createElement). */
	createCanvas?: (width: number, height: number) => PdfCanvas;
	/** Converts a rendered canvas to an image File for the OCR chain. */
	canvasToFile?: (canvas: PdfCanvas, pageNumber: number) => Promise<File>;
	/** Render scale (default 2 — sharp enough for receipt OCR, cheap enough). */
	renderScale?: number;
}

/** Worker from the CDN on first use — same pattern as the tesseract core. */
export function pdfWorkerSrc(): string {
	return `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
}

/** Lazy-loads pdf.js once and returns its getDocument. */
async function loadGetDocument(): Promise<PdfGetDocument> {
	const pdfjs = await import('pdfjs-dist');
	pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc();
	// SAFETY: the pdfjs typings model the whole API surface; only the text-
	// extraction subset above is used, and the assertion merely narrows to
	// that documented subset (getDocument(src).promise always resolves).
	// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- PdfDoc is a structural subset of PDFDocumentProxy; the chain is the only way to drop the extra surface without redeclaring it.
	return (src) => pdfjs.getDocument(src).promise as unknown as Promise<PdfDoc>;
}

let cachedGetDocument: PdfGetDocument | null = null;

/** Pages read per import — large PDFs are truncated, never rejected. */
export const PDF_IMPORT_PAGE_CAP = 5;

/** A page whose text layer is shorter than this is treated as a scan. */
const OCR_MIN_CHARS = 20;

/** Default render target: a throwaway canvas element. */
function defaultCreateCanvas(width: number, height: number): PdfCanvas {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

/** Default canvas→File: PNG blob (tesseract/Prompt API both read PNGs). */
async function defaultCanvasToFile(canvas: PdfCanvas, pageNumber: number): Promise<File> {
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) throw new Error('canvas toBlob failed');
	return new File([blob], `page-${pageNumber}.png`, { type: 'image/png' });
}

/** Why an import failed — each value maps to a specific user-facing message. */
export type PdfImportStatus = 'ok' | 'password' | 'open-failed' | 'worker-failed' | 'unreadable';

/** Outcome of importReceiptPdf; `text` is the parse-pipeline input on 'ok'. */
export interface PdfImportResult {
	status: PdfImportStatus;
	/** Text layer + OCR text, pages joined in order ('' unless status ok). */
	text: string;
	/** True when any page needed OCR (the caller may say so). */
	ocrUsed: boolean;
	pagesProcessed: number;
	pagesTotal: number;
	/** True when the page cap truncated the document. */
	pagesSkipped: boolean;
}

/** Maps a getDocument rejection to a reason-specific status. */
// SAFETY: pdf.js rejections are Error subclasses at every call site we
// control; name/message probing is the documented way to distinguish
// PasswordException from transport/worker failures (no richer contract exists).
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- classified above.
function classifyFailure(error: unknown): PdfImportStatus {
	const name = error instanceof Error ? error.name : '';
	const message = error instanceof Error ? error.message : String(error);
	// pdf.js throws PasswordException (name) for encrypted files; some
	// wrappers only keep the message — match either.
	if (name === 'PasswordException' || /password/i.test(message)) return 'password';
	if (/worker/i.test(message)) return 'worker-failed';
	return 'open-failed';
}

/** Renders one page and OCRs it; resolves '' on any failure (page skipped). */
async function ocrPage(doc: PdfDoc, pageNumber: number, deps: PdfImportDeps): Promise<string> {
	try {
		const page = await doc.getPage(pageNumber);
		if (!page.getViewport || !page.render) return '';
		const scale = deps.renderScale ?? 2;
		const viewport = page.getViewport({ scale });
		const canvas = (deps.createCanvas ?? defaultCreateCanvas)(viewport.width, viewport.height);
		const ctx = canvas.getContext();
		if (!ctx) return '';
		await page.render({ canvasContext: ctx, viewport }).promise;
		const file = await (deps.canvasToFile ?? defaultCanvasToFile)(canvas, pageNumber);
		page.cleanup?.();
		const outcome = await (deps.ocrImage ?? scanReceiptImage)(file);
		return outcome.text ?? '';
	} catch {
		return '';
	}
}

/**
 * Extracts a PDF's text layer, pages joined in order. Empty string when
 * the document has no text layer (image-only/scanned PDF — caller routes
 * to the OCR flow). Throws when the PDF can't be read at all.
 */
export async function extractPdfTextFromPdf(
	file: File,
	deps: ReceiptPdfDeps = {}
): Promise<string> {
	const getDocument = deps.getDocument ?? (cachedGetDocument ??= await loadGetDocument());
	const data = new Uint8Array(await file.arrayBuffer());
	const doc = await getDocument({ data, isEvalSupported: false });
	try {
		const pages: string[] = [];
		for (let i = 1; i <= doc.numPages; i++) {
			const page = await doc.getPage(i);
			const content = await page.getTextContent();
			const text = content.items
				.map((item) => item.str ?? '')
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim();
			if (text) pages.push(text);
		}
		return pages.join('\n');
	} finally {
		await doc.destroy();
	}
}

/**
 * Full PDF import (issue 033 v2): text layer first; pages with near-empty
 * text are rendered to canvas and OCR'd on-device; everything lands in the
 * same parse pipeline. Every failure mode resolves with a classified
 * status — the caller shows a reason-specific message, never a dead end.
 * Progress notes ("reading with OCR…") stream through onNote.
 */
export async function importReceiptPdf(
	file: File,
	deps: PdfImportDeps = {},
	onNote: (note: string) => void = () => {}
): Promise<PdfImportResult> {
	onNote('Reading PDF…');
	const data = new Uint8Array(await file.arrayBuffer());
	let getDocument: PdfGetDocument;
	try {
		getDocument = deps.getDocument ?? (cachedGetDocument ??= await loadGetDocument());
	} catch {
		// The pdf.js module itself couldn't load (script/CDN blocked).
		return {
			status: 'worker-failed',
			text: '',
			ocrUsed: false,
			pagesProcessed: 0,
			pagesTotal: 0,
			pagesSkipped: false
		};
	}
	let doc: PdfDoc;
	try {
		doc = await getDocument({ data, isEvalSupported: false });
	} catch (error) {
		return {
			status: classifyFailure(error),
			text: '',
			ocrUsed: false,
			pagesProcessed: 0,
			pagesTotal: 0,
			pagesSkipped: false
		};
	}
	try {
		const pagesTotal = doc.numPages;
		const pagesProcessed = Math.min(pagesTotal, PDF_IMPORT_PAGE_CAP);
		const pagesSkipped = pagesTotal > pagesProcessed;
		// Per page: text-layer string, or null when it reads as a scan.
		const pageTexts: Array<string | null> = [];
		for (let i = 1; i <= pagesProcessed; i++) {
			const page = await doc.getPage(i);
			const content = await page.getTextContent();
			const text = content.items
				.map((item) => item.str ?? '')
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim();
			pageTexts.push(text.length >= OCR_MIN_CHARS ? text : null);
		}
		let ocrUsed = false;
		if (pageTexts.some((text) => text === null)) {
			onNote(
				pageTexts.every((text) => text === null)
					? 'No text found — reading with OCR…'
					: 'Some pages look scanned — reading those with OCR…'
			);
			for (let i = 0; i < pageTexts.length; i++) {
				if (pageTexts[i] !== null) continue;
				ocrUsed = true;
				const ocrText = await ocrPage(doc, i + 1, deps);
				pageTexts[i] = ocrText.trim() ? ocrText : '';
			}
		}
		const text = pageTexts
			.map((pageText) => pageText?.trim() ?? '')
			.filter(Boolean)
			.join('\n');
		return {
			status: text ? 'ok' : 'unreadable',
			text,
			ocrUsed,
			pagesProcessed,
			pagesTotal,
			pagesSkipped
		};
	} finally {
		await doc.destroy();
	}
}
