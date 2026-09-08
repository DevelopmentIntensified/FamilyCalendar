/**
 * Client-side PDF text extraction (issue 033, v1b). pdf.js (pdfjs-dist,
 * pinned) runs in the browser via a lazy dynamic import — the dependency
 * and its ~1MB worker are only fetched when a user actually imports a PDF.
 * Only the TEXT LAYER is extracted; the PDF file itself never leaves the
 * device. Image-only (scanned) PDFs yield empty text and the caller routes
 * them to the existing photo-scan flow.
 */

/** The pinned pdfjs-dist version (single source of truth with the server). */
import { pdfjsVersion } from '$lib/utils/pdfVersion';

/** The subset of the pdf.js API this module touches. */
export interface PdfDoc {
	numPages: number;
	getPage(page: number): Promise<{
		getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
	}>;
	destroy(): Promise<void>;
}

export type PdfGetDocument = (src: {
	data: Uint8Array;
	isEvalSupported: boolean;
}) => Promise<PdfDoc>;

export type ReceiptPdfDeps = {
	getDocument?: PdfGetDocument;
};

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
	// SAFETY: the pdfjs typings model the whole API surface; only the text-
	// extraction subset above is used, and the assertion merely narrows to
	// that documented subset (getDocument(src).promise always resolves).
	// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- PdfDoc is a structural subset of PDFDocumentProxy; the chain is the only way to drop the extra surface without redeclaring it.
	return (src) => pdfjs.getDocument(src).promise as unknown as Promise<PdfDoc>;
}

let cachedGetDocument: PdfGetDocument | null = null;

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
