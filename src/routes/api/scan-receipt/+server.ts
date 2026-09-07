import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { clientKey, rateLimit } from '$lib/server/utils/rateLimit';
import { requireUserJson } from '$lib/server/utils/requireUser';
import {
	analyzeReceiptWithAzure,
	AzureScanError,
	type AzureReceiptScan
} from '$lib/server/services/azureReceiptService';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Collaborators injectable for tests (no real network, no real env);
 * defaults wire production.
 */
export type ScanReceiptDeps = {
	/** Azure credential presence check — never returns the values to clients. */
	config: () => { apiKey?: string; endpoint?: string };
	analyze: (image: Blob) => Promise<AzureReceiptScan>;
	allowRequest: (request: Request) => boolean;
};

const defaultDeps: ScanReceiptDeps = {
	config: () => ({
		apiKey: process.env.AZURE_DOC_INTELLIGENCE_KEY,
		endpoint: process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT
	}),
	analyze: (image) => {
		const { apiKey, endpoint } = defaultDeps.config();
		// SAFETY: both are non-empty — the availability gate below runs first.
		return analyzeReceiptWithAzure(image, { fetchFn: fetch, endpoint: endpoint!, apiKey: apiKey! });
	},
	allowRequest: (request) => rateLimit(clientKey(request, 'scan-receipt'), 10, 60_000)
};

/**
 * Opt-in cloud receipt scan (issue 010 final OCR chain step). The client
 * only calls this after the user explicitly accepted the Azure prompt —
 * this endpoint is the single point where a receipt image ever leaves the
 * device. The image is forwarded to Azure Document Intelligence
 * (prebuilt-receipt) and immediately dropped; Azure auto-deletes it within
 * 24h and never trains on it (#029). Nothing is stored here.
 */
export const POST = async (event: RequestEvent, deps: ScanReceiptDeps = defaultDeps) => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	if (!deps.allowRequest(event.request)) {
		return json({ error: 'Too many scans. Try again shortly.' }, { status: 429 });
	}

	// Capability gate: env presence only, checked before anything else so the
	// client can show "cloud scan is not available" instead of a 502.
	const { apiKey, endpoint } = deps.config();
	if (!apiKey || !endpoint) {
		return json({ error: 'Cloud scan is not available' }, { status: 503 });
	}

	const form = await event.request.formData();
	const image = form.get('image');
	if (!(image instanceof File)) {
		return json({ error: 'Send a receipt photo in the image field.' }, { status: 400 });
	}
	if (!ALLOWED_IMAGE_TYPES.has(image.type) || image.size > MAX_IMAGE_BYTES) {
		return json(
			{ error: 'Send a receipt photo (JPEG, PNG, or WebP, up to 10MB).' },
			{ status: 400 }
		);
	}

	try {
		const scan = await deps.analyze(image);
		return json({ scan });
	} catch (error) {
		// Plain user-facing message only — never the key or a stack.
		const message =
			error instanceof AzureScanError ? error.message : 'Cloud scan failed. Try again.';
		return json({ error: message }, { status: 502 });
	}
};
