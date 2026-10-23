interface FamilyInviteEmailParams {
	/** The family member who minted the link, named as the sender. */
	inviterName: string;
	/** The minted, code-bound join link (issue 152's durable invite row). */
	inviteUrl: string;
}

/**
 * Issue 091 — the family-invite email's copy, held outside the route handler
 * so it is testable without sending. Plain HTML: one link, one deadline, one
 * opt-out line for a stranger who did not ask for it.
 */
export function getFamilyInviteEmailHtml({ inviterName, inviteUrl }: FamilyInviteEmailParams): string {
	return `
<p>${inviterName} invited you to join their family on Family Planz.</p>
<p><a href="${inviteUrl}">Join the family</a></p>
<p>The link expires in 24 hours. If you were not expecting this email, you can ignore it — nothing happens to your account.</p>
`.trim();
}
