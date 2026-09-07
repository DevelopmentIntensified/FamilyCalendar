import { json } from '@sveltejs/kit';
import { canLinkAttachment } from '$lib/server/db/actions/attachments';
import type { Attachment } from '$lib/server/db/schema';

/**
 * Validates a request-body attachmentId (bill receipt reference, issue 010)
 * for a bill in the user's scope. Undefined means "not provided"; null means
 * "detach". Returns either the id to store, null to clear, or an error
 * Response. Injectable getAttachment keeps tests off module mocks.
 */
export async function resolveAttachmentId(
	// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
	raw: unknown,
	userId: string,
	familyId: string | null,
	getAttachment: (
		id: string
	) => Promise<Pick<Attachment, 'id' | 'ownerUserId' | 'familyId'> | undefined>
): Promise<{ id: string | null } | { error: Response }> {
	if (raw === undefined || raw === null) return { id: null };
	// oxlint-disable-next-line anti-slop/no-runtime-typeof -- boundary parser: request JSON arrives untyped; rejecting non-strings here IS the contract.
	if (typeof raw !== 'string') {
		return { error: json({ error: 'attachmentId must be a string or null' }, { status: 400 }) };
	}
	const attachment = await getAttachment(raw);
	if (!attachment || !canLinkAttachment(attachment, userId, familyId)) {
		// Same message for missing and foreign receipts: don't leak which.
		return { error: json({ error: 'Receipt not found' }, { status: 403 }) };
	}
	return { id: attachment.id };
}
