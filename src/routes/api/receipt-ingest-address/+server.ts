import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import {
	getOrCreateIngestToken,
	regenerateIngestToken,
	ingestAddress
} from '$lib/server/db/actions/receiptIngest';

/**
 * The user's personal receipt-ingest address (issue 033):
 * `receipts.<token>@<RECEIPT_INGEST_DOMAIN>`. GET returns the current
 * address (creating the token on first view); POST regenerates the token
 * (old address stops working). Hidden entirely when RECEIPT_INGEST_DOMAIN
 * is unset — the feature is off.
 */

export const GET = async (event: RequestEvent): Promise<Response> => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	const token = await getOrCreateIngestToken(auth.user.id);
	return json({ address: ingestAddress(token) });
};

export const POST = async (event: RequestEvent): Promise<Response> => {
	const auth = requireUserJson(event.locals);
	if (auth.response) return auth.response;

	if (!process.env.RECEIPT_INGEST_DOMAIN) {
		return json({ error: 'Email ingest is not configured' }, { status: 503 });
	}

	const token = await regenerateIngestToken(auth.user.id);
	return json({ address: ingestAddress(token) });
};
