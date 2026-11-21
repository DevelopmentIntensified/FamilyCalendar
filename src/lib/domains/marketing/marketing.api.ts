/**
 * The browsing client for the module's one contact surface.
 *
 * `POST /api/contact` is a SvelteKit form action (`+page.server.ts`) that reads
 * `request.formData()`, so the shared client's JSON encoder cannot send it: the
 * fetcher below hands the kernel client a `FormData` body while the client
 * keeps its one request shape and one error ladder (the server answers
 * `{error}` on every refusal, so the caller shows the wire copy).
 *
 * Doc: ./README.md#public-interface
 */
import { createApiClient, type ApiResult, type Fetcher } from '$lib/kernel/client/apiClient';
import type { ContactSentResponse } from './marketing.contract';

/** What the contact form sends; `website` is the hidden honeypot. */
export type ContactFields = {
	readonly name: string;
	readonly email: string;
	readonly message: string;
	readonly website: string;
};

/** One submit's outcome: `{ok:true}` or the wire's sentence with its status. */
export type ContactSendResult = ApiResult<ContactSentResponse>;

export type ContactApi = {
	/** One submit: `{ok:true}` once the provider accepted it, else the wire's sentence. */
	send(fields: ContactFields): Promise<ContactSendResult>;
};

const CONTACT_PATH = '/api/contact';

export function createContactApi(fetcher: Fetcher = fetch): ContactApi {
	return {
		send(fields) {
			const body = new FormData();
			body.set('website', fields.website);
			body.set('name', fields.name);
			body.set('email', fields.email);
			body.set('message', fields.message);
			return createApiClient(() =>
				fetcher(CONTACT_PATH, { method: 'POST', body })
			).request<ContactSentResponse>('POST', CONTACT_PATH);
		}
	};
}
