/**
 * Client bridge to receipt OCR (issue 010). Engine fallback chain per the
 * issue directive: (1) Chrome Prompt API on-device image input, (2) native
 * OCR bridge (ML Kit / iOS Vision via window.FamilyPlanz.ocr — stub until
 * a native app exists), (3) tesseract.js WASM worker (lazy bootstrap).
 * Extraction itself is pure (receiptScan.ts, unit-tested); this module only
 * moves bytes off the main thread. Images never leave the device except the
 * EXPLICIT cloud opt-in below (Azure prebuilt-receipt, 24h auto-delete,
 * #029).
 */

import { isBillCategory } from '$lib/data/categories';
import {
	isPoorExtraction,
	scanReceipt,
	type CloudReceiptScan,
	type ReceiptScanResult
} from '$lib/utils/receiptScan';

export interface ScanOutcome {
	ok: boolean;
	text: string;
}

export type ScanEngine = (
	file: File,
	onProgress: (progress: number) => void
) => Promise<ScanOutcome | null>;

/** Runs engines in order; first non-null result wins; all-null = failure. */
export async function scanWithEngines(
	engines: ReadonlyArray<ScanEngine>,
	file: File,
	onProgress: (progress: number) => void = () => {}
): Promise<ScanOutcome> {
	for (const engine of engines) {
		try {
			const outcome = await engine(file, onProgress);
			if (outcome) return outcome;
		} catch {
			// Unavailable/failed engine ≠ scan failure; fall through to the next.
		}
	}
	return { ok: false, text: '' };
}

/** Prompt-message shape for the (experimental) Chrome Prompt API image input. */
interface PromptMessage {
	role: 'user';
	content: Array<{ type: string; value: unknown }>;
}

/** Guarded probe of the Chrome Prompt API (desktop Chrome 148+, on-device). */
async function promptApiEngine(
	file: File,
	onProgress: (progress: number) => void
): Promise<ScanOutcome | null> {
	interface PromptApiLike {
		availability: () => Promise<string>;
		create: () => Promise<{ prompt: (messages: PromptMessage[]) => Promise<string> }>;
	}
	// SAFETY: the Prompt API is experimental; probing globalThis by shape
	// keeps the dependency optional — any absence returns null so the
	// fallback chain continues with the next engine.
	const lm = (globalThis as { LanguageModel?: PromptApiLike }).LanguageModel;
	if (!lm) return null;
	if ((await lm.availability()) !== 'available') return null;
	onProgress(0.1);
	const session = await lm.create();
	const text = await session.prompt([
		{
			role: 'user',
			content: [
				{ type: 'image', value: file },
				{ type: 'text', value: 'Transcribe every line of text on this receipt exactly.' }
			]
		}
	]);
	onProgress(1);
	return { ok: Boolean(text), text };
}

/** Native OCR bridge contract (ML Kit / iOS Vision when a native app exists). */
interface NativeOcrBridge {
	/** Returns recognized text, or null when the platform OCR is unavailable. */
	recognize?: (blob: Blob) => Promise<string | null>;
}

/** The window.FamilyPlanz shell global a native app would register. */
interface FamilyPlanzGlobal {
	ocr?: NativeOcrBridge;
}

async function nativeBridgeEngine(
	file: File,
	onProgress: (progress: number) => void
): Promise<ScanOutcome | null> {
	// SAFETY: the native shell global only exists inside the Capacitor app;
	// its absence (plain web) returns null so the chain continues.
	const bridge = (globalThis as { FamilyPlanz?: FamilyPlanzGlobal }).FamilyPlanz?.ocr;
	if (!bridge?.recognize) return null;
	onProgress(0.2);
	const text = await bridge.recognize(file);
	onProgress(1);
	return text ? { ok: true, text } : null;
}

let worker: Worker | null = null;
let nextScanId = 1;

function ensureWorker(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL('../workers/receiptOcr.worker.ts', import.meta.url), {
		type: 'module'
	});
	return worker;
}

/** Tesseract.js WASM worker engine; resolves empty text on failure. */
async function tesseractEngine(
	file: File,
	onProgress: (progress: number) => void
): Promise<ScanOutcome> {
	return new Promise((resolve) => {
		let w: Worker;
		try {
			w = ensureWorker();
		} catch {
			resolve({ ok: false, text: '' });
			return;
		}
		const id = nextScanId++;
		const imageUrl = URL.createObjectURL(file);
		let settled = false;

		const cleanup = () => {
			w.removeEventListener('message', onMessage);
			URL.revokeObjectURL(imageUrl);
			settled = true;
		};

		function onMessage(event: MessageEvent<OcrWorkerMessage>) {
			const message = event.data;
			// The worker's logger emits progress without the scan id (single
			// concurrent scan in the UI); result messages carry the id.
			if (message.id !== undefined && message.id !== id) return;
			if (message.progress !== undefined) {
				onProgress(message.progress);
				return;
			}
			cleanup();
			resolve({ ok: !message.error, text: message.text ?? '' });
		}

		w.addEventListener('message', onMessage);
		try {
			w.postMessage({ id, imageUrl });
		} catch {
			if (!settled) {
				cleanup();
				resolve({ ok: false, text: '' });
			}
		}
	});
}

/** Message the OCR worker posts back (progress carries no scan id). */
interface OcrWorkerMessage {
	id?: number;
	progress?: number;
	text?: string;
	error?: string;
}

/** The ordered engine chain from the issue directive. */
function engines(): ScanEngine[] {
	return [promptApiEngine, nativeBridgeEngine, tesseractEngine];
}

/**
 * Runs OCR over an image File through the engine chain; resolves with the
 * recognized text (empty on failure — callers treat empty as "couldn't
 * read, fill manually").
 */
export function scanReceiptImage(
	file: File,
	onProgress: (progress: number) => void = () => {}
): Promise<ScanOutcome> {
	return scanWithEngines(engines(), file, onProgress);
}

/**
 * The final OCR chain step (issue 010): the opt-in cloud scan. The image
 * is EXIF-stripped (canvas re-encode), POSTed to /api/scan-receipt, and
 * normalized to the shared CloudReceiptScan shape. Errors always carry a
 * plain user-facing message (the route never sends key material).
 *
 * Injectable deps keep the tests offline: no real fetch, no real canvas.
 */
export type CloudScanDeps = {
	fetchFn: typeof fetch;
	/** Removes EXIF/GPS metadata before the upload (defaults to stripExif). */
	strip: (file: File) => Promise<Blob>;
};

const cloudDefaultDeps: CloudScanDeps = { fetchFn: fetch, strip: stripExif };

/**
 * Re-encodes the image through a canvas, which drops ALL metadata
 * (EXIF/GPS) — the file sent to Azure carries pixels only. Falls back to a
 * byte-wise APP1 strip when canvas is unavailable (tests, hardened envs).
 */
export async function stripExif(file: File): Promise<Blob> {
	try {
		return await reencodeViaCanvas(file);
	} catch {
		return stripJpegExifSegments(file);
	}
}

async function reencodeViaCanvas(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');
	ctx.drawImage(bitmap, 0, 0);
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/jpeg', 0.92)
	);
	if (!blob) throw new Error('Canvas re-encode failed');
	return blob;
}

/**
 * Byte-wise JPEG APP1 (EXIF/XMP) segment drop for environments without
 * canvas. Non-JPEGs and structurally unexpected buffers pass through
 * untouched — the canvas path is the real stripper; this never risks
 * corrupting an image.
 */
function stripJpegExifSegments(file: File): Promise<Blob> {
	return file.arrayBuffer().then((buffer) => {
		const src = new Uint8Array(buffer);
		if (src[0] !== 0xff || src[1] !== 0xd8) return file; // not a JPEG
		const chunks: Uint8Array[] = [src.subarray(0, 2)];
		let i = 2;
		while (i + 1 < src.length && src[i] === 0xff) {
			const marker = src[i + 1];
			// Standalone markers (TEM, RSTn, SOI/EOI) carry no length field.
			if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
				chunks.push(src.subarray(i, i + 2));
				i += 2;
				continue;
			}
			if (i + 4 > src.length) return file;
			const length = (src[i + 2] << 8) | src[i + 3];
			if (length < 2) return file;
			if (marker === 0xda) {
				// Start of Scan: entropy-coded data runs to EOF, no metadata.
				chunks.push(src.subarray(i));
				i = src.length;
				break;
			}
			if (marker === 0xe1) {
				// APP1 = EXIF/XMP metadata — dropped entirely.
				i += 2 + length;
				continue;
			}
			chunks.push(src.subarray(i, i + 2 + length));
			i += 2 + length;
		}
		if (i !== src.length) return file; // truncated/corrupt — keep original
		return new Blob(chunks, { type: 'image/jpeg' });
	});
}

/** Raw scan body of POST /api/scan-receipt (server-normalized Azure data). */
interface RawCloudScan {
	merchant?: string | null;
	totalCents?: number | null;
	date?: string | null;
	lineItems?: Array<{ label?: string; priceCents?: number }> | null;
	category?: string;
}

/** Type guards: typeof narrowing is allowed only in predicate position. */
function isText(value: unknown): value is string {
	return typeof value === 'string';
}
function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function normalizeCloudScan(scan: RawCloudScan): CloudReceiptScan {
	const lineItems = Array.isArray(scan.lineItems)
		? scan.lineItems
				.filter(
					(item): item is { label: string; priceCents: number } =>
						Boolean(item.label) && isFiniteNumber(item.priceCents)
				)
				.map((item) => ({ label: item.label, priceCents: item.priceCents }))
		: null;
	// Shared vocabulary guard (arch audit #4): the old local CLOUD_CATEGORIES
	// copy was missing 'tax'/'fees', so Azure scans with those categories
	// silently downgraded to 'other'.
	const category = isBillCategory(scan.category) ? scan.category : 'other';
	return {
		merchant: isText(scan.merchant) ? scan.merchant : null,
		totalCents: isFiniteNumber(scan.totalCents) ? scan.totalCents : null,
		date: isText(scan.date) ? scan.date : null,
		lineItems,
		category: category ?? 'other'
	};
}

export async function cloudScanReceipt(
	file: File,
	deps: CloudScanDeps = cloudDefaultDeps
): Promise<CloudReceiptScan> {
	const { fetchFn, strip } = deps;
	let clean: Blob;
	try {
		clean = await strip(file);
	} catch {
		throw new Error('Could not prepare the receipt photo. Try again.');
	}
	const form = new FormData();
	form.set('image', new File([clean], 'receipt.jpg', { type: 'image/jpeg' }));

	let res: Response;
	try {
		res = await fetchFn('/api/scan-receipt', { method: 'POST', body: form });
	} catch {
		throw new Error('Cloud scan is unreachable. Try again.');
	}
	const body: { scan?: RawCloudScan; error?: string } = await res
		.json()
		.catch(() => ({ error: undefined }));
	if (!res.ok) {
		// 429/503/502 all carry a plain route-crafted message.
		throw new Error(body.error ?? 'Cloud scan is not available right now.');
	}
	if (!body.scan) {
		throw new Error('Cloud scan returned nothing readable.');
	}
	return normalizeCloudScan(body.scan);
}

/** Result of the full local→cloud fallback flow. */
export interface ScanFlowResult {
	/** 'poor' = empty text or neither merchant nor total — cloud may help. */
	quality: 'ok' | 'poor';
	text: string;
	local: ReceiptScanResult;
	/** Present only when quality was poor, cloud was allowed, and it worked. */
	cloud?: CloudReceiptScan;
	/** Plain user-facing message when the cloud step failed. */
	cloudError?: string;
}

export interface ScanFlowOptions {
	/**
	 * Only pass TRUE after the user explicitly opted in — this module never
	 * auto-sends a receipt. The bills page asks first, then calls this with
	 * allowCloud for the accepted scan.
	 */
	allowCloud?: boolean;
	onProgress?: (progress: number) => void;
	/** Injectable local chain (tests); defaults to the real engine chain. */
	runLocal?: (file: File, onProgress: (progress: number) => void) => Promise<ScanOutcome>;
	/** Injectable cloud deps (tests); defaults to real fetch + stripExif. */
	cloud?: Partial<CloudScanDeps>;
}

/**
 * Full fallback flow: local engine chain first; only when the extraction
 * is POOR and the user allowed cloud does the image leave the device
 * (EXIF-stripped) for Azure.
 */
export async function scanReceiptWithFallback(
	file: File,
	options: ScanFlowOptions = {}
): Promise<ScanFlowResult> {
	const { allowCloud = false, onProgress = () => {}, runLocal = scanReceiptImage } = options;
	const outcome = await runLocal(file, onProgress);
	const local = scanReceipt(outcome.text);
	const flow: ScanFlowResult = {
		quality: isPoorExtraction(outcome.text, local) ? 'poor' : 'ok',
		text: outcome.text,
		local
	};
	if (flow.quality !== 'poor' || !allowCloud) return flow;
	try {
		flow.cloud = await cloudScanReceipt(file, {
			fetchFn: options.cloud?.fetchFn ?? fetch,
			strip: options.cloud?.strip ?? stripExif
		});
	} catch (error) {
		flow.cloudError = error instanceof Error ? error.message : 'Cloud scan failed. Try again.';
	}
	return flow;
}
