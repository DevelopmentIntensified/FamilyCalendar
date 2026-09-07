/**
 * Client bridge to receipt OCR (issue 010). Engine fallback chain per the
 * issue directive: (1) Chrome Prompt API on-device image input, (2) native
 * OCR bridge (ML Kit / iOS Vision via window.FamilyPlanz.ocr — stub until
 * a native app exists), (3) tesseract.js WASM worker (lazy bootstrap).
 * Extraction itself is pure (receiptScan.ts, unit-tested); this module only
 * moves bytes off the main thread. Images never leave the device.
 */

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
