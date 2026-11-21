/**
 * Real `Mailer`: the Resend HTTP API behind the legacy `utils/sendEmail.ts`
 * (`resend.emails.send`), called directly so the kernel takes no dependency
 * and a test injects `fetcher` instead of mocking a module.
 *
 * Config is a parameter, never `process.env` (rule R6): src/lib/app reads
 * `RESEND_API_KEY` and `NOREPLYEMAIL` and builds this adapter.
 *
 * Doc: src/lib/kernel/README.md#mail
 */
import type { Mailer, MailMessage } from './mailer';

export type ResendMailerConfig = {
	/** Resend API key (`RESEND_API_KEY`). */
	readonly apiKey: string;
	/** Default sender when a message omits `from` (`NOREPLYEMAIL`). */
	readonly from: string;
};

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Rejects with the provider's message when Resend refuses: the legacy caller's `send-failed` branch. */
export function createResendMailer(
	config: ResendMailerConfig,
	fetcher: typeof fetch = fetch
): Mailer {
	return {
		async send(message: MailMessage): Promise<void> {
			const response = await fetcher(RESEND_ENDPOINT, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${config.apiKey}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify(bodyOf(config, message))
			});
			if (!response.ok) throw new Error(await refusalMessage(response));
		}
	};
}

/** The legacy `resend.emails.send` payload: `reply_to` is the API's name for `replyTo`. */
function bodyOf(config: ResendMailerConfig, message: MailMessage): Record<string, string> {
	const body: Record<string, string> = {
		from: message.from ?? config.from,
		to: message.to,
		subject: message.subject,
		html: message.html
	};
	if (message.text !== undefined) body.text = message.text;
	if (message.replyTo !== undefined) body.reply_to = message.replyTo;
	return body;
}

async function refusalMessage(response: Response): Promise<string> {
	const status = `Resend rejected the email (HTTP ${response.status})`;
	try {
		const payload: unknown = await response.json();
		if (payload && typeof payload === 'object' && 'message' in payload) {
			const detail = payload.message;
			if (typeof detail === 'string' && detail !== '') return `${status}: ${detail}`;
		}
	} catch {
		// A non-JSON refusal: the status is all the provider gave us.
	}
	return status;
}
