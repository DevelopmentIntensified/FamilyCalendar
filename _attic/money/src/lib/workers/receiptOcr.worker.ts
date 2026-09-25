/// <reference lib="webworker" />
import { createWorker } from 'tesseract.js';

/**
 * Receipt OCR worker (issue 010). Runs tesseract.js off the main thread;
 * lang data + WASM core load from the CDN on first use (default langPath).
 * Messages: { id, imageUrl } in → { id, progress? | text? | error? } out.
 */
let tesseract: Awaited<ReturnType<typeof createWorker>> | null = null;

async function getTesseract() {
	if (!tesseract) {
		tesseract = await createWorker('eng', 1, {
			logger: (message: { status: string; progress: number }) => {
				if (message.status === 'recognizing text') {
					self.postMessage({ progress: message.progress });
				}
			}
		});
	}
	return tesseract;
}

self.onmessage = async (event: MessageEvent<{ id: number; imageUrl: string }>) => {
	const { id, imageUrl } = event.data;
	try {
		const worker = await getTesseract();
		const result = await worker.recognize(imageUrl);
		self.postMessage({ id, text: result.data.text });
	} catch (error) {
		self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
	}
};
