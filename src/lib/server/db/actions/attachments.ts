import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { attachments, bills, type Attachment } from '$lib/server/db/schema';

export interface CreateAttachmentInput {
	ownerUserId: string;
	familyId: string | null;
	url: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
}

export async function createAttachment(input: CreateAttachmentInput): Promise<Attachment> {
	const [row] = await db.insert(attachments).values(input).returning();
	return row;
}

export async function getAttachment(id: string): Promise<Attachment | undefined> {
	const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
	return row;
}

/** Attachment rows for the given ids; empty ids short-circuit to no query. */
export async function getAttachmentsByIds(ids: string[]): Promise<Attachment[]> {
	if (ids.length === 0) return [];
	return db.select().from(attachments).where(inArray(attachments.id, ids));
}

/** Client-safe projection of an attachment attached to a bill. */
export interface ReceiptRef {
	id: string;
	url: string;
	filename: string;
	mimeType: string;
}

/** Named owner contract: billId → receipt, absent key = no receipt. */
export interface ReceiptsByBillId {
	[billId: string]: ReceiptRef;
}

/** Maps billId → receipt for bills whose attachment row still exists. */
export function buildReceiptsByBillId(
	bills: ReadonlyArray<{ id: string; attachmentId: string | null }>,
	attachments: readonly Attachment[]
): ReceiptsByBillId {
	const byId = new Map(attachments.map((a) => [a.id, a]));
	const map: ReceiptsByBillId = {};
	for (const bill of bills) {
		if (!bill.attachmentId) continue;
		const found = byId.get(bill.attachmentId);
		if (!found) continue;
		map[bill.id] = {
			id: found.id,
			url: found.url,
			filename: found.filename,
			mimeType: found.mimeType
		};
	}
	return map;
}

/** Pure permission predicate: the attachment's owner, or an admin/creator of
 * the family it was uploaded into, may manage it. Mirrors canMutateBill.
 * Takes a structural subset so route seams can pass narrow projections. */
export function canManageAttachment(
	attachment: Pick<Attachment, 'id' | 'ownerUserId' | 'familyId'>,
	userId: string,
	role: string | null
): boolean {
	if (attachment.ownerUserId === userId) return true;
	if (attachment.familyId === null) return false;
	return role === 'creator' || role === 'admin';
}

/**
 * Pure permission predicate: an attachment may be linked to a bill when the
 * bill's owner uploaded it, or it lives in the same family. (Managing —
 * deleting — it is stricter: canManageAttachment.)
 */
export function canLinkAttachment(
	attachment: Pick<Attachment, 'id' | 'ownerUserId' | 'familyId'>,
	userId: string,
	familyId: string | null
): boolean {
	if (attachment.ownerUserId === userId) return true;
	return familyId !== null && attachment.familyId === familyId;
}

/**
 * Detaches every bill pointing at the attachment and deletes the row in one
 * transaction, so no bill can reference a half-deleted attachment.
 */
export async function deleteAttachment(id: string): Promise<boolean> {
	const removed = await db.transaction(async (tx) => {
		await tx.update(bills).set({ attachmentId: null }).where(eq(bills.attachmentId, id));
		const rows = await tx.delete(attachments).where(eq(attachments.id, id)).returning();
		return rows.length > 0;
	});
	return removed;
}
