/**
 * family api: the browser client for the endpoints this module's pages call,
 * on the kernel api client (K-07). Every method returns `ApiResult`, so a state
 * class rolls back and toasts instead of catching (rule R9: no module mocks).
 *
 * The add-member tabs, the two searches, the invite doors and the join button
 * all go through family's own public `/api` routes — never the legacy
 * `/family/{id}/members/add/…` delegates — so there is one wire in use.
 *
 * Doc: ./README.md#public-interface
 */
import { createApiClient, type ApiResult } from '$lib/kernel/client/apiClient';
import type {
	ChildAddedResponse,
	FamilySearchResponse,
	InviteLinkResponse,
	InviteSentResponse,
	MemberSearchResponse,
	MintInviteResponse
} from './family.contract';

/** What a delete/mint-door answer carries: success, or the refusal copy. */
type FamilyAck = { readonly success: true };

/** The child form as the tab sends it. */
export type FamilyChildForm = {
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string;
	readonly consentAcknowledged: boolean;
};

/** An emailed invite or a shareable link: the same three fields. */
export type FamilyInviteTargetForm = {
	readonly email: string;
	readonly firstName: string;
	readonly lastName: string;
};

/** The browser client's surface: one method per endpoint the pages call. */
export interface FamilyApi {
	/** `GET /api/family/member-search`: the create page's picker (verified prefixes, masked). */
	searchMembers(
		q: string,
		excludeIds?: readonly string[]
	): Promise<ApiResult<MemberSearchResponse>>;
	/** `GET /api/family/search`: the add-member page's exact-match directory lookup. */
	searchInvitableMembers(q: string, familyId: string): Promise<ApiResult<FamilySearchResponse>>;
	/** `POST /api/families/{id}/members/direct`: put an existing account straight in. */
	addDirect(familyId: string, userId: string): Promise<ApiResult<FamilyAck>>;
	/** `POST /api/families/{id}/members/child`: create the child's account and consent record. */
	addChild(familyId: string, form: FamilyChildForm): Promise<ApiResult<ChildAddedResponse>>;
	/** `POST /api/families/{id}/members/email`: send an emailed invite. */
	sendInviteEmail(
		familyId: string,
		form: FamilyInviteTargetForm
	): Promise<ApiResult<InviteSentResponse>>;
	/** `POST /api/families/{id}/members/email/link`: mint the shareable link for those names. */
	mintInviteLink(
		familyId: string,
		form: FamilyInviteTargetForm
	): Promise<ApiResult<InviteLinkResponse>>;
	/** `POST /api/family/invite`: mint a code with the New-code band's validity and uses. */
	mintInvite(
		familyId: string,
		expiresInDays: number,
		maxUses: number
	): Promise<ApiResult<MintInviteResponse>>;
	/** `DELETE /api/family/invite`: kill one code for anybody who has not used it. */
	revokeInvite(code: string): Promise<ApiResult<FamilyAck>>;
	/** `POST /api/family/join`: accept a code through the locked accept transaction. */
	joinFamily(code: string): Promise<ApiResult<FamilyAck>>;
}

export function createFamilyApi(client = createApiClient()): FamilyApi {
	return {
		searchMembers(q, excludeIds = []) {
			const exclude = excludeIds.map((id) => `exclude=${encodeURIComponent(id)}`).join('&');
			return client.request(
				'GET',
				`/api/family/member-search?q=${encodeURIComponent(q)}${exclude ? `&${exclude}` : ''}`
			);
		},
		searchInvitableMembers(q, familyId) {
			return client.request(
				'GET',
				`/api/family/search?q=${encodeURIComponent(q)}&familyId=${encodeURIComponent(familyId)}`
			);
		},
		addDirect(familyId, userId) {
			return client.request(
				'POST',
				`/api/families/${encodeURIComponent(familyId)}/members/direct`,
				{ userId }
			);
		},
		addChild(familyId, form) {
			return client.request(
				'POST',
				`/api/families/${encodeURIComponent(familyId)}/members/child`,
				form
			);
		},
		sendInviteEmail(familyId, form) {
			return client.request(
				'POST',
				`/api/families/${encodeURIComponent(familyId)}/members/email`,
				form
			);
		},
		mintInviteLink(familyId, form) {
			return client.request(
				'POST',
				`/api/families/${encodeURIComponent(familyId)}/members/email/link`,
				form
			);
		},
		mintInvite(familyId, expiresInDays, maxUses) {
			return client.request('POST', '/api/family/invite', {
				familyId,
				expiresInDays,
				maxUses
			});
		},
		revokeInvite(code) {
			return client.request('DELETE', '/api/family/invite', { code });
		},
		joinFamily(code) {
			return client.request('POST', '/api/family/join', { code });
		}
	};
}

