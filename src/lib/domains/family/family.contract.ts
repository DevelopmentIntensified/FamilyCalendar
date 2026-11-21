/**
 * family contract: the zod schemas and types for every `/api` body, query and
 * response this module owns (dates on the wire are ISO strings), plus the
 * create-family page's form shape. Server-side row shapes with real `Date`s
 * live at the bottom and never sit on the wire.
 *
 * The error copy is the wire: `family.http.db.test.ts` pins it. Keep the
 * legacy wording verbatim.
 *
 * Where a refusal's ORDER is part of the wire (the child form checks the plan
 * before it reads the body; the member patch applies the role before the
 * Member Type), the schema stays lenient and the rule in
 * `family.members.rules.ts` / `family.families.rules.ts` owns the refusal.
 * The schemas here reproduce the legacy body coercions exactly: a non-string
 * `userId` is "no user id", an absent name is `''`, and only `true` is consent.
 *
 * Doc: ./README.md#invariants
 */
import {
	formList,
	INVALID_JSON_MESSAGE,
	isoInstant,
	z
} from '$lib/kernel/validation/validators';

/** The one 400 for a `memberIds` field that is present but not a list. */
export const MEMBER_IDS_NOT_ARRAY_MESSAGE = 'memberIds must be an array';

// --- Coercions the legacy handlers performed --------------------------------

/**
 * A wire text field the legacy code read as `typeof x === 'string' ? x : ''`:
 * absent, null, numbers and objects all become `''`, so the rule answers with
 * the legacy copy instead of a zod message.
 */
const wireText = z.preprocess((value) => (typeof value === 'string' ? value : ''), z.string());

/**
 * An optional wire text field that remembers "present": absent stays
 * `undefined` (the field is skipped), while null or a non-string becomes `''`
 * (the field runs and refuses, as the legacy member patch did).
 */
const wireOptionalText = z.preprocess(
	(value) => (value === undefined ? undefined : typeof value === 'string' ? value : ''),
	z.string().optional()
);

/** A query value that legacy read with `if (requested)`: empty/absent is null. */
const wirePresentText = z.preprocess(
	(value) => (typeof value === 'string' && value.length > 0 ? value : null),
	z.string().nullable()
);

/** The child form's checkbox: only a literal `true` consents. */
const wireConsent = z.preprocess((value) => value === true, z.boolean());

/**
 * A body the legacy doors read by destructuring (`const { code } = body`):
 * a literal `null`, an array, a string or a number yielded `undefined` for
 * every field, so the door answered its own missing-field sentence. Mapping
 * every non-object to `{}` reproduces that, and the endpoint's `'lenient'`
 * body mode maps a malformed or unreadable body to the same place.
 */
function wireObject<S extends z.ZodType>(schema: S) {
	return z.preprocess(
		(value) => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}),
		schema
	);
}

// --- `/api/families` (list) -------------------------------------------------

/** A family as JSON: `createdAt` is an ISO string. */
export const FamilyResponse = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string().nullable(),
	createdAt: isoInstant()
});
export type FamilyResponse = z.infer<typeof FamilyResponse>;

/** One roster row: the membership role and the Member Type side by side. */
export const RosterMemberResponse = z.object({
	userId: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().nullable(),
	role: z.string().nullable(),
	memberType: z.string().nullable()
});
export type RosterMemberResponse = z.infer<typeof RosterMemberResponse>;

/**
 * A roster row on the `/family` list, tagged with its family. Unlike the
 * detail and `/api/family/roster` rows it carries NO email: the list's side
 * rail shows name, Member Type and role only.
 */
export const FamilyRosterRowResponse = RosterMemberResponse.omit({ email: true }).extend({
	familyId: z.string()
});
export type FamilyRosterRowResponse = z.infer<typeof FamilyRosterRowResponse>;

/** A code that can still be used, as the list carries it. */
export const ActiveInviteResponse = z.object({
	familyId: z.string(),
	code: z.string(),
	useCount: z.number().nullable(),
	maxUses: z.number().nullable(),
	expiresAt: isoInstant()
});
export type ActiveInviteResponse = z.infer<typeof ActiveInviteResponse>;

/** One `/family` card: the footprint strip and the viewer's own permission. */
export const FamilyCardResponse = FamilyResponse.extend({
	memberCount: z.number().int(),
	openTasks: z.number().int(),
	members: z.array(z.object({ firstName: z.string(), userId: z.string() })),
	createdLabel: z.string(),
	canInvite: z.boolean(),
	role: z.string().nullable()
});
export type FamilyCardResponse = z.infer<typeof FamilyCardResponse>;

/** `GET /api/families`. */
export const FamilyOverviewResponse = z.object({
	families: z.array(FamilyCardResponse),
	roster: z.array(FamilyRosterRowResponse),
	activeInvites: z.array(ActiveInviteResponse),
	plan: z.object({ used: z.number().int(), limit: z.number().int() })
});
export type FamilyOverviewResponse = z.infer<typeof FamilyOverviewResponse>;

// --- `/api/families` (create) ----------------------------------------------

/**
 * `POST /api/families`. The name and colour are read leniently (the create
 * rule owns "required"/"50 chars"/"palette"); `memberIds` is the one field the
 * legacy route refused before the plan gate ran.
 */
export const CreateFamilyBody = z.object(
	{
		name: wireText,
		color: wireText,
		memberIds: z.array(z.json(), { error: MEMBER_IDS_NOT_ARRAY_MESSAGE }).optional()
	},
	{ error: INVALID_JSON_MESSAGE }
);
export type CreateFamilyBody = z.infer<typeof CreateFamilyBody>;

/**
 * The `/family/create` page action. The same fields as `CreateFamilyBody`, but
 * form-encoded: `memberIds` arrives as one field per pick.
 */
export const CreateFamilyFormBody = z.object({
	name: wireText,
	color: wireText,
	memberIds: formList(z.string())
});
export type CreateFamilyFormBody = z.infer<typeof CreateFamilyFormBody>;

/** `201 {family}`. */
export const CreateFamilyResponse = z.object({ family: FamilyResponse });
export type CreateFamilyResponse = z.infer<typeof CreateFamilyResponse>;

/** The create refusal's body; only the plan gate adds `upgradeRequired`. */
export const CreateFamilyErrorResponse = z.object({
	error: z.string(),
	upgradeRequired: z.boolean().optional()
});
export type CreateFamilyErrorResponse = z.infer<typeof CreateFamilyErrorResponse>;

// --- `/api/families/{id}` (detail and update) ------------------------------

/** `GET /api/families/{id}` activity item (the timestamps are already ISO). */
export const FamilyActivityResponse = z.object({
	kind: z.enum(['completed', 'assigned']),
	title: z.string(),
	actorName: z.string(),
	targetName: z.string().nullable(),
	at: isoInstant()
});
export type FamilyActivityResponse = z.infer<typeof FamilyActivityResponse>;

/** The four family-scoped Dashboard Module switches. */
export const ModuleSwitchResponse = z.object({
	board: z.boolean(),
	kids: z.boolean(),
	groceries: z.boolean(),
	meals: z.boolean()
});
export type ModuleSwitchResponse = z.infer<typeof ModuleSwitchResponse>;

/** The detail payload's live code: no `familyId` (the family is already known). */
export const DetailInviteResponse = z.object({
	code: z.string(),
	useCount: z.number().int(),
	maxUses: z.number().nullable(),
	expiresAt: isoInstant()
});
export type DetailInviteResponse = z.infer<typeof DetailInviteResponse>;

/** The plan/tier numbers the detail side band shows. */
export const PlanUsageResponse = z.object({
	tierName: z.string().nullable(),
	aiUsed: z.number(),
	aiLimit: z.number(),
	familiesUsed: z.number().int(),
	familyLimit: z.number().int(),
	members: z.number().int(),
	memberLimit: z.number().int(),
	archivedRetentionDays: z.number().int(),
	exportImportEnabled: z.boolean()
});
export type PlanUsageResponse = z.infer<typeof PlanUsageResponse>;

/** `GET /api/families/{id}`. */
export const FamilyDetailResponse = z.object({
	family: FamilyResponse,
	members: z.array(RosterMemberResponse),
	currentUserRole: z.string(),
	currentUserId: z.string(),
	activity: z.array(FamilyActivityResponse),
	moduleSwitches: ModuleSwitchResponse,
	hiddenDashboardModules: z.array(z.string()),
	activeInvite: DetailInviteResponse.nullable(),
	inviteCreatedBy: z.string().nullable(),
	planUsage: PlanUsageResponse
});
export type FamilyDetailResponse = z.infer<typeof FamilyDetailResponse>;

/** The `{id}` route parameter. */
export const FamilyParams = z.object({ id: z.string() });
export type FamilyParams = z.infer<typeof FamilyParams>;

/**
 * `PATCH /api/families/{id}`. Absent = unchanged; a present-but-blank name or
 * a present non-hex colour is refused with its own copy (the legacy route
 * validated the body before the role check).
 */
export const UpdateFamilyBody = z.object(
	{
		name: z
			.string({ error: 'Invalid name' })
			.trim()
			.min(1, { error: 'Invalid name' })
			.optional(),
		color: z
			.string({ error: 'Invalid color' })
			.regex(/^#[0-9a-fA-F]{6}$/, { error: 'Invalid color' })
			.optional()
	},
	{ error: INVALID_JSON_MESSAGE }
);
export type UpdateFamilyBody = z.infer<typeof UpdateFamilyBody>;

/** `200 {success, family}`. */
export const UpdateFamilyResponse = z.object({
	success: z.literal(true),
	family: FamilyResponse
});
export type UpdateFamilyResponse = z.infer<typeof UpdateFamilyResponse>;

// --- `/api/families/{id}/invite-codes` -------------------------------------

/** One code as the invitations rail shows it (`useCount` is never null there). */
export const InviteCodeResponse = z.object({
	code: z.string(),
	useCount: z.number().int(),
	maxUses: z.number().nullable(),
	expiresAt: isoInstant(),
	createdBy: z.string().nullable()
});
export type InviteCodeResponse = z.infer<typeof InviteCodeResponse>;

/** `GET /api/families/{id}/invite-codes`; a plain member gets the empty list. */
export const InviteCodesResponse = z.object({
	canManageInvites: z.boolean(),
	codes: z.array(InviteCodeResponse)
});
export type InviteCodesResponse = z.infer<typeof InviteCodesResponse>;

// --- `/api/families/{id}/members/{userId}` --------------------------------

/** The `{id, userId}` route parameters. */
export const FamilyMemberParams = z.object({ id: z.string(), userId: z.string() });
export type FamilyMemberParams = z.infer<typeof FamilyMemberParams>;

/**
 * The four member-add doors are reachable through TWO paths: family's own
 * `/family/{familyId}/members/add/…` handler and the `/api/families/{id}/…`
 * twin the installed clients call. The endpoint is shared, so the schema
 * accepts either parameter name and the handler resolves `id ?? familyId`.
 */
export const FamilyDoorParams = z.object({
	id: z.string().optional(),
	familyId: z.string().optional()
});
export type FamilyDoorParams = z.infer<typeof FamilyDoorParams>;

/** `PATCH .../members/{userId}`: either field may be absent; null is not absent. */
export const MemberPatchBody = z.object(
	{
		role: wireOptionalText,
		memberType: wireOptionalText
	},
	{ error: INVALID_JSON_MESSAGE }
);
export type MemberPatchBody = z.infer<typeof MemberPatchBody>;

/** `200 {success:true}`, shared by the member PATCH and DELETE. */
export const MemberUpdatedResponse = z.object({ success: z.literal(true) });
export type MemberUpdatedResponse = z.infer<typeof MemberUpdatedResponse>;

// --- `/api/families/{id}/members/direct` ----------------------------------

/** `POST .../members/direct`; non-string means "no user id". */
export const AddDirectBody = wireObject(z.object({ userId: wireOptionalText }));
export type AddDirectBody = z.infer<typeof AddDirectBody>;

// --- `/api/families/{id}/members/child` -----------------------------------

/**
 * `POST .../members/child`. The fields are read leniently so the handler can
 * check membership and the plan first, exactly as the legacy route did; the
 * field refusals live in `childDetailsRefusal`.
 */
export const AddChildBody = wireObject(
	z.object({
		firstName: wireText,
		lastName: wireText,
		email: wireText,
		consentAcknowledged: wireConsent
	})
);
export type AddChildBody = z.infer<typeof AddChildBody>;

/** `200 {success, user}`; the child's account already exists, with an email. */
export const ChildAddedResponse = z.object({
	success: z.literal(true),
	user: z.object({
		id: z.string(),
		firstName: z.string(),
		lastName: z.string(),
		email: z.string().nullable()
	})
});
export type ChildAddedResponse = z.infer<typeof ChildAddedResponse>;

// --- `/api/families/{id}/members/email` and `.../email/link` --------------

/** The emailed invite and invite-link body: an address and both names. */
export const InviteTargetBody = wireObject(
	z.object({
		email: wireText,
		firstName: wireText,
		lastName: wireText
	})
);
export type InviteTargetBody = z.infer<typeof InviteTargetBody>;

/** `200 {success:true}` for an emailed invite. */
export const InviteSentResponse = z.object({ success: z.literal(true) });
export type InviteSentResponse = z.infer<typeof InviteSentResponse>;

/** `200 {success, link}` for a shareable invite link. */
export const InviteLinkResponse = z.object({ success: z.literal(true), link: z.string() });
export type InviteLinkResponse = z.infer<typeof InviteLinkResponse>;

/**
 * The two emailed-invite validation refusals answer `success:false` rather
 * than the shared `{error}` body. Kept apart so a client cannot read a failed
 * send as a success.
 */
export const InviteEmailErrorResponse = z.object({
	success: z.literal(false),
	error: z.string()
});
export type InviteEmailErrorResponse = z.infer<typeof InviteEmailErrorResponse>;

// --- `/api/family/invite` --------------------------------------------------

/** `POST /api/family/invite`: the family, plus the two clamped counts. */
export const MintInviteBody = wireObject(
	z.object({
		familyId: wireText,
		expiresInDays: z.json().optional(),
		maxUses: z.json().optional()
	})
);
export type MintInviteBody = z.infer<typeof MintInviteBody>;

/** `200 {code, expiresAt, inviteUrl}`. */
export const MintInviteResponse = z.object({
	code: z.string(),
	expiresAt: isoInstant(),
	inviteUrl: z.string()
});
export type MintInviteResponse = z.infer<typeof MintInviteResponse>;

/** `GET /api/family/invite?code=`; absent/empty stays `''` for the 400. */
export const InvitePreviewQuery = z.object({ code: wireText });
export type InvitePreviewQuery = z.infer<typeof InvitePreviewQuery>;

/** `200 {family, isAlreadyMember}`; the family is the invite's public face. */
export const InvitePreviewResponse = z.object({
	family: z.object({
		id: z.string(),
		name: z.string(),
		color: z.string().nullable()
	}),
	isAlreadyMember: z.boolean()
});
export type InvitePreviewResponse = z.infer<typeof InvitePreviewResponse>;

/** `DELETE /api/family/invite` and `POST /api/family/join` share one body. */
export const InviteCodeBody = wireObject(z.object({ code: wireText }));
export type InviteCodeBody = z.infer<typeof InviteCodeBody>;

// --- `/api/family/member-search` ------------------------------------------

/**
 * `GET /api/family/member-search?q=&exclude=`; `exclude` repeats. Blank ids
 * are dropped here (the legacy route did `getAll('exclude').filter(Boolean)`),
 * so an `&exclude=` with no value never reaches the query.
 */
export const MemberSearchQuery = z.object({
	q: wireText,
	exclude: formList(z.string()).transform((ids) => ids.filter((id) => id.length > 0))
});
export type MemberSearchQuery = z.infer<typeof MemberSearchQuery>;

/** One masked picker hit: enough to tell two people apart, not to harvest. */
export const MemberSearchHitResponse = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().nullable()
});
export type MemberSearchHitResponse = z.infer<typeof MemberSearchHitResponse>;

/** `200 {users}` (masked emails, at most ten, unordered). */
export const MemberSearchResponse = z.object({ users: z.array(MemberSearchHitResponse) });
export type MemberSearchResponse = z.infer<typeof MemberSearchResponse>;

// --- `/api/family/roster` --------------------------------------------------

/** `GET /api/family/roster?familyId=`; absent/empty means "your family". */
export const RosterQuery = z.object({ familyId: wirePresentText });
export type RosterQuery = z.infer<typeof RosterQuery>;

/** `200 {familyId, members}`; no family answers `{familyId:null, members:[]}`. */
export const RosterResponse = z.object({
	familyId: z.string().nullable(),
	members: z.array(RosterMemberResponse)
});
export type RosterResponse = z.infer<typeof RosterResponse>;

// --- `/api/family/search` --------------------------------------------------

/** `GET /api/family/search?q=&familyId=`; a missing half answers an empty list. */
export const FamilySearchQuery = z.object({ q: wireText, familyId: wirePresentText });
export type FamilySearchQuery = z.infer<typeof FamilySearchQuery>;

/** One invite-flow hit: the full address (the invite goes to the real one). */
export const InvitableUserResponse = z.object({
	id: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().nullable()
});
export type InvitableUserResponse = z.infer<typeof InvitableUserResponse>;

/** `200 {users}` (exact match, at most ten). */
export const FamilySearchResponse = z.object({ users: z.array(InvitableUserResponse) });
export type FamilySearchResponse = z.infer<typeof FamilySearchResponse>;

// --- Shared error bodies ---------------------------------------------------

/** The shared `{error}` body every refusal without its own shape uses. */
export const FamilyErrorResponse = z.object({ error: z.string() });
export type FamilyErrorResponse = z.infer<typeof FamilyErrorResponse>;

// --- Server-side row shapes ------------------------------------------------

/**
 * A family row with a real `Date`. Never sent directly: `ok()` serialises it
 * and the `*Response` schemas above describe the resulting JSON.
 */
export type FamilyView = {
	readonly id: string;
	readonly name: string;
	readonly color: string | null;
	readonly createdAt: Date;
};

/** One membership read: the family, the viewer's two labels, and the roster summary. */
export type FamilyMembershipView = {
	readonly family: FamilyView;
	readonly role: string | null;
	readonly memberType: string | null;
	readonly memberCount: number;
	readonly firstNames: string[];
};

/** A roster row as the repo reads it. */
export type RosterMemberView = {
	readonly userId: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string | null;
	readonly role: string | null;
	readonly memberType: string | null;
};

/** A roster row of the `/family` list: the family it belongs to, and no email. */
export type FamilyRosterRowView = Omit<RosterMemberView, 'email'> & {
	readonly familyId: string;
};

/** One composed `/family` card, before the wire serialises `createdAt`. */
export type FamilyCardView = FamilyView & {
	readonly memberCount: number;
	readonly openTasks: number;
	readonly members: { readonly firstName: string; readonly userId: string }[];
	readonly createdLabel: string;
	readonly canInvite: boolean;
	readonly role: string | null;
};

/** An invite code row with a real `Date`. */
export type InviteCodeView = {
	readonly code: string;
	readonly familyId: string;
	readonly expiresAt: Date;
	readonly maxUses: number | null;
	readonly useCount: number | null;
	readonly createdBy: string | null;
};

/** The detail payload's live code, before serialization. */
export type DetailInviteView = {
	readonly code: string;
	readonly useCount: number;
	readonly maxUses: number | null;
	readonly expiresAt: Date;
};

/** The detail payload before serialization. */
export type FamilyDetailView = {
	readonly family: FamilyView;
	readonly members: RosterMemberView[];
	readonly currentUserRole: string;
	readonly currentUserId: string;
	readonly activity: { kind: 'completed' | 'assigned'; title: string; actorName: string; targetName: string | null; at: string }[];
	readonly moduleSwitches: Record<string, boolean>;
	readonly hiddenDashboardModules: string[];
	readonly activeInvite: DetailInviteView | null;
	readonly inviteCreatedBy: string | null;
	readonly planUsage: {
		tierName: string | null;
		aiUsed: number;
		aiLimit: number;
		familiesUsed: number;
		familyLimit: number;
		members: number;
		memberLimit: number;
		archivedRetentionDays: number;
		exportImportEnabled: boolean;
	};
};

/** One masked picker hit (also the wire row; it carries no dates). */
export type MemberSearchHit = {
	readonly id: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly email: string | null;
};

/** One invite-flow hit, with the full address. */
export type InvitableUser = MemberSearchHit;
