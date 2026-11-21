/**
 * Mail port + in-memory adapter. Services send through `ctx.mail`, so no
 * module imports Resend and a test can read exactly what went out.
 *
 * One message per call, the fields the legacy `utils/sendEmail.ts` callers
 * pass: `to`, `subject` and `html`, plus an optional `text`, `from` and
 * `replyTo`. `from` is optional because the real adapter has a default sender
 * (`NOREPLYEMAIL`); a service that must name a different sender passes
 * `ctx.config.mailFrom` or its own address.
 *
 * Doc: src/lib/kernel/README.md#mail
 */

export type MailMessage = {
	readonly to: string;
	readonly subject: string;
	readonly html: string;
	readonly text?: string;
	/** Overrides the adapter's default sender for this message. */
	readonly from?: string;
	readonly replyTo?: string;
};

export type Mailer = {
	/** Sends one message: resolves when the provider accepted it, rejects when it did not. */
	send(message: MailMessage): Promise<void>;
};

export type MemoryMailer = Mailer & {
	/** Every message sent through this mailer, in order (tests). */
	readonly outbox: MailMessage[];
};

export function createMemoryMailer(): MemoryMailer {
	const outbox: MailMessage[] = [];
	return {
		outbox,
		send: async (message) => {
			outbox.push(message);
		}
	};
}
