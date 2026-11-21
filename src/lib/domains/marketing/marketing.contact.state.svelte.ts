/**
 * The `/contact` form's client state: the six fields the legacy page kept in
 * `let`s, the pending flag, the inline error and the success swap.
 *
 * Behaviour, verbatim from the legacy page: the button disables and says
 * "Sending..." while the request is in flight; a refusal shows the wire's
 * sentence in a red box and keeps every field; a success swaps the form for
 * "Message Sent!" with a "Send another message" button that clears the fields.
 * The honeypot input stays in the form and travels with the submit, exactly as
 * the legacy hidden `website` field did.
 *
 * Methods only — no `$effect`, no `$app/*` — so it is tested in node with a
 * fake api, and the screen owns the layout.
 *
 * Doc: ./README.md#public-interface
 */
import type { ContactApi } from './marketing.api';

export class MarketingContactState {
	website = $state('');
	name = $state('');
	email = $state('');
	message = $state('');
	/** The request is in flight: the button says "Sending...". */
	pending = $state(false);
	/** The success card is showing instead of the form. */
	sent = $state(false);
	/** The refusal sentence, in the form's inline red box. */
	error = $state('');

	private readonly api: ContactApi;

	constructor(api: ContactApi) {
		this.api = api;
	}

	/** One submit. A refusal keeps the fields so nothing typed is lost. */
	async submit(): Promise<void> {
		if (this.pending) return;
		this.pending = true;
		this.error = '';
		const result = await this.api.send({
			website: this.website,
			name: this.name,
			email: this.email,
			message: this.message
		});
		this.pending = false;
		if (!result.ok) {
			this.error = result.error;
			return;
		}
		this.sent = true;
	}

	/** "Send another message": back to an empty form. */
	sendAnother(): void {
		this.sent = false;
		this.error = '';
		this.website = '';
		this.name = '';
		this.email = '';
		this.message = '';
	}
}
