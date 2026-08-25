import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVapidPublicKey } from '$lib/server/services/pushService';

export const GET: RequestHandler = async () => {
	return json({ publicKey: getVapidPublicKey() });
};
