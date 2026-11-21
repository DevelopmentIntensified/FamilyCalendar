/**
 * The account screen's browser client: the lazy per-section fetch and the
 * export download.
 *
 * The section route is the screen's own page data (not `/api`), so it answers
 * the same `AccountSectionModel` the load's default section carries. The export
 * is a file download, not JSON-in-JS: the response is saved as the dated
 * attachment the route names, with the filename rule shared with the route.
 *
 * Doc: ./README.md#public-interface
 */
import { createApiClient, type ApiResult, type Fetcher } from '$lib/kernel/client/apiClient';
import type { AccountSectionModel } from './account.contract';
import { exportFileName } from './account.export.rules';
import type { AccountSectionId } from './account.sections.rules';

/** The two calls the screen makes. */
export type AccountApi = {
	readonly fetchSection: (section: AccountSectionId) => Promise<ApiResult<AccountSectionModel>>;
	/** Saves the requester's document under the dated filename; `now` is the page's load instant. */
	readonly downloadExport: (now: Date) => Promise<ApiResult<void>>;
};

export function createAccountApi(
	client = createApiClient(),
	fetcher: Fetcher = fetch
): AccountApi {
	return {
		fetchSection: (section) => client.request('GET', `/account/section/${section}`),
		downloadExport: async (now) => {
			let response: Response;
			try {
				response = await fetcher('/api/account/export');
			} catch {
				return { ok: false, status: 0, error: 'Network problem. Try again.' };
			}
			if (!response.ok) {
				return { ok: false, status: response.status, error: `Export failed (${response.status})` };
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = exportFileName(now);
			link.click();
			URL.revokeObjectURL(url);
			return { ok: true, data: undefined };
		}
	};
}
