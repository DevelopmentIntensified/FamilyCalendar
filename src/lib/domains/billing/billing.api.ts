/**
 * billing api: the plan card's one read, typed by the wire contract.
 *
 * The client is injectable so a state class or a test passes its own; a
 * refusal keeps the server's copy through `ApiResult`.
 *
 * Doc: ./README.md#public-interface
 */
import { createApiClient, type ApiClient, type ApiResult } from '$lib/kernel/client/apiClient';
import type { SubscriptionSummary } from './billing.contract';

export function fetchSubscriptionSummary(
	client: ApiClient = createApiClient()
): Promise<ApiResult<SubscriptionSummary>> {
	return client.request<SubscriptionSummary>('GET', '/api/me/subscription');
}
