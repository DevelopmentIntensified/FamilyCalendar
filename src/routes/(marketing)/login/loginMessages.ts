/**
 * #246: some redirects to /login carry machine codes (`?error=invalid_token`
 * from the email-invite route). Map them to copy; free-text messages from
 * the auth callbacks pass through unchanged.
 */
const ERROR_COPY: Record<string, string> = {
	missing_token: 'That invite link is incomplete. Open the link from your email again.',
	invalid_token: 'That invite link has expired or is invalid. Ask for a new invite.'
};

export function loginErrorCopy(raw: string): string {
	return ERROR_COPY[raw] ?? raw;
}
