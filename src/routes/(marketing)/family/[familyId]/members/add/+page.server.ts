// +page.server.ts
import type { PageServerLoad } from '../../../../signup/$types';
import { type RequestEvent } from '@sveltejs/kit';

export const load: PageServerLoad = async (event: RequestEvent) => {
	return {
		familyId: event.params.familyId
	};
};
