/**
 * Server-side PDF text extraction (#033 email-ingest path). Uses the
 * pdfjs-dist LEGACY build (Node-compatible) behind a lazy dynamic import so
 * the ~1MB dependency never loads unless a PDF attachment actually arrives.
 * Only the extracted TEXT is used — the PDF bytes are dropped when this
 * returns; a received PDF is never persisted by us.
 *
 * pdf.js needs a DOM-ish global even in the legacy build; the minimal stubs
 * below satisfy the text-extraction path on Node 20+.
 */
import { pdfjsVersion } from '$lib/utils/pdfVersion';

export const PDFJS_CDN_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/legacy/build/`;

/** Extracts the text layer of one PDF, pages joined with newlines. */
export async function extractPdfText(pdf: Buffer): Promise<string> {
	// Tiny DOM shims for the legacy build under Node (page text extraction
	// only — no rendering, no fonts fetched from the document).
	// SAFETY: the DOM shims satisfy pdf.js's Node environment probe; the
	// cast only widens globalThis with those optional class slots.
	// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- boundary cast, justified above.
	const g = globalThis as { DOMMatrix?: unknown; ImageData?: unknown; Path2D?: unknown };
	g.DOMMatrix ??= class {};
	g.ImageData ??= class {};
	g.Path2D ??= class {};

	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const doc = await getDocument({
		data: new Uint8Array(pdf),
		isEvalSupported: false,
		useSystemFonts: true
	}).promise;

	const pages: string[] = [];
	try {
		for (let i = 1; i <= doc.numPages; i++) {
			const page = await doc.getPage(i);
			const content = await page.getTextContent();
			const text = content.items
				.map((item) => ('str' in item ? item.str : ''))
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim();
			if (text) pages.push(text);
		}
	} finally {
		await doc.destroy();
	}
	return pages.join('\n');
}
