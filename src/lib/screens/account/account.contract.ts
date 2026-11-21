/**
 * account contract: the wire this screen owns.
 *
 * - The three `/api` route methods the goldens pin (`GET /api/me`,
 *   `DELETE /api/me`, `GET /api/account/export`), exactly as the frozen
 *   `account.http.db.test.ts` carries them: every body, every refusal shape and
 *   the legacy copy.
 * - The internal section parameter and model for
 *   `GET /account/section/[section]` (Q-077), designed fresh: the endpoint is
 *   page data outside `/api`, so the Android wire does not grow.
 *
 * `AccountSectionParam` is the one id check (a `z.enum` built from
 * `ACCOUNT_SECTIONS`), so the rail, the endpoint and the hash rule cannot
 * disagree about which sections exist.
 *
 * Dates on the wire are ISO strings (the goldens pin the exact strings);
 * server-side rows with real `Date`s never sit on these schemas.
 *
 * Doc: ./README.md#public-interface
 */
import { INVALID_JSON_MESSAGE, isoInstant, z } from '$lib/kernel/validation/validators';
import { ACCOUNT_SECTIONS, type AccountSectionId } from './account.sections.rules';
import { EXPORT_VERSION } from './account.export.rules';

// --- `GET /api/me` ----------------------------------------------------------

/**
 * The caller's own person as the shell wire carries it: the placeholder email
 * of an Anonymous Account is masked to `null` by the handler, never here.
 * Strict, so a credential (`passwordHash`) cannot ride along with a widened
 * select.
 */
export const AccountPersonModel = z.strictObject({
	id: z.string(),
	firstName: z.string().nullable(),
	lastName: z.string().nullable(),
	email: z.string().nullable(),
	emailVerified: z.boolean(),
	isAnonymous: z.boolean(),
	roles: z.array(z.string()),
	lastActiveAt: isoInstant().nullable()
});
export type AccountPersonModel = z.infer<typeof AccountPersonModel>;

/** `200` body of `GET /api/me`: the person plus the family the chrome keys on. */
export const AccountMeResponse = z.strictObject({
	id: z.string(),
	firstName: z.string().nullable(),
	lastName: z.string().nullable(),
	email: z.string().nullable(),
	emailVerified: z.boolean(),
	isAnonymous: z.boolean(),
	roles: z.array(z.string()),
	lastActiveAt: isoInstant().nullable(),
	familyId: z.string().nullable()
});
export type AccountMe = z.infer<typeof AccountMeResponse>;

// --- `DELETE /api/me` -------------------------------------------------------

/**
 * `DELETE /api/me` body. Legacy read `confirmation` and turned every non-string
 * (absent, `null`, a number) into `''`, so the service's one comparison answers
 * "Confirmation does not match" for all of them; the coercion belongs here so
 * the refusal keeps that one message. A body that is not a JSON object is the
 * kernel's `400 {"error":"Invalid JSON"}` before this schema sees it.
 */
export const AccountDeleteBody = z.object(
	{
		confirmation: z.preprocess(
			(value) => (typeof value === 'string' ? value : ''),
			z.string()
		)
	},
	// A body that is not a JSON object (an array, a string, a number, `null`) is
	// the legacy reader's `Invalid JSON`, exactly like malformed JSON.
	{ error: INVALID_JSON_MESSAGE }
);
export type AccountDeleteBody = z.infer<typeof AccountDeleteBody>;

/** `200` body of `DELETE /api/me`. */
export const AccountDeleteResponse = z.strictObject({ success: z.literal(true) });
export type AccountDeleteResponse = z.infer<typeof AccountDeleteResponse>;

/**
 * The one `400 {"error":…}` body `DELETE /api/me` answers when the typed
 * confirmation is not the caller id. A missing or non-string confirmation is
 * the same refusal (see `AccountDeleteBody`).
 */
export const CONFIRMATION_MISMATCH_MESSAGE = 'Confirmation does not match';

// --- `GET /api/account/export` ---------------------------------------------

/**
 * One exported row. Each domain owns the columns of its own slice, so the
 * screen's contract verifies the envelope and the scope decisions, not a
 * second copy of eight tables.
 */
export const AccountExportRow = z.record(z.string(), z.unknown());
export type AccountExportRow = z.infer<typeof AccountExportRow>;

/**
 * One family context in the export: the family's basics, MY membership row, and
 * every other member as a name only. Names-only is enforced here as well as in
 * `exportedPersonNames`, so a later projection cannot widen it silently.
 */
export const AccountExportFamily = z.strictObject({
	family: z.strictObject({
		id: z.string(),
		name: z.string(),
		color: z.string().nullable(),
		createdAt: isoInstant()
	}),
	membership: z.strictObject({
		userId: z.string(),
		familyId: z.string(),
		role: z.string().nullable(),
		memberType: z.string().nullable()
	}),
	otherMembers: z.array(
		z.strictObject({
			id: z.string(),
			firstName: z.string().nullable(),
			lastName: z.string().nullable()
		})
	)
});
export type AccountExportFamily = z.infer<typeof AccountExportFamily>;

/**
 * `200` body of `GET /api/account/export`: one document, every slice in the
 * legacy order (`ACCOUNT_EXPORT_KEYS`). The account row refuses
 * `passwordHash` — the credential is not user data (#189).
 */
export const AccountExportDocumentResponse = z.strictObject({
	version: z.literal(EXPORT_VERSION),
	generatedAt: isoInstant(),
	account: AccountExportRow.refine((row) => !('passwordHash' in row), {
		error: 'The export never carries passwordHash'
	}),
	settings: z.array(AccountExportRow),
	subscriptions: z.array(AccountExportRow),
	families: z.array(AccountExportFamily),
	events: z.array(AccountExportRow),
	eventAttendance: z.array(AccountExportRow),
	eventExceptions: z.array(AccountExportRow),
	tasks: z.array(AccountExportRow),
	taskTags: z.array(AccountExportRow),
	taskCompletions: z.array(AccountExportRow),
	bills: z.array(AccountExportRow),
	receiptItems: z.array(AccountExportRow),
	groceryItems: z.array(AccountExportRow),
	notifications: z.array(AccountExportRow)
});
export type AccountExportDocument = z.infer<typeof AccountExportDocumentResponse>;

/** Everything `composeAccountExport` receives; the envelope is added there. */
export type AccountExportSlices = Omit<AccountExportDocument, 'version' | 'generatedAt'>;

// --- `/account/section/[section]` ------------------------------------------

/**
 * The section the internal endpoint was asked for. Built from
 * `ACCOUNT_SECTIONS`, so the enum is the one id check and a section cannot be
 * added to the rail without a parameter accepting it.
 */
const ACCOUNT_SECTION_IDS = ACCOUNT_SECTIONS.map((section) => section.id) as [
	AccountSectionId,
	...AccountSectionId[]
];
export const AccountSectionParam = z.enum(ACCOUNT_SECTION_IDS);
export type AccountSectionParam = z.infer<typeof AccountSectionParam>;

/** One membership row of the families section: the real roster count and my role. */
export const AccountFamilyModel = z.strictObject({
	id: z.string(),
	name: z.string(),
	role: z.string().nullable(),
	memberType: z.string().nullable(),
	memberCount: z.number().int()
});
export type AccountFamilyModel = z.infer<typeof AccountFamilyModel>;

/** The four notification switches, by id (alerts owns the vocabulary). */
export const AccountNotificationPreferencesModel = z.strictObject({
	taskAssigned: z.boolean(),
	taskCompleted: z.boolean(),
	familyJoined: z.boolean(),
	aiSuggestions: z.boolean()
});
export type AccountNotificationPreferencesModel = z.infer<
	typeof AccountNotificationPreferencesModel
>;

/** One switch as the card lists it; the copy and default come from alerts. */
export const AccountNotificationOptionModel = z.strictObject({
	id: z.string(),
	label: z.string(),
	hint: z.string(),
	default: z.boolean()
});
export type AccountNotificationOptionModel = z.infer<typeof AccountNotificationOptionModel>;

/** The calendar card's settings (identity's stored-or-defaults view, on the wire). */
export const AccountCalendarSettingsModel = z.strictObject({
	weekStart: z.string().nullable(),
	timeZone: z.string().nullable(),
	color: z.string().nullable(),
	defaultView: z.string().nullable(),
	defaultCalendarId: z.string().nullable(),
	syncEventsToFamilyCalendar: z.boolean().nullable(),
	autoParseEventDetails: z.boolean().nullable(),
	showAdsAsEvents: z.boolean().nullable()
});
export type AccountCalendarSettingsModel = z.infer<typeof AccountCalendarSettingsModel>;

/** One selectable calendar: the calendar card renders its name only. */
export const AccountCalendarModel = z.strictObject({
	id: z.string(),
	name: z.string()
});
export type AccountCalendarModel = z.infer<typeof AccountCalendarModel>;

/** One ad-consent trail entry (sponsored's vocabulary and timestamp). */
export const AccountConsentModel = z.strictObject({
	decision: z.string(),
	recordedAt: isoInstant()
});
export type AccountConsentModel = z.infer<typeof AccountConsentModel>;

/** One Dashboard Module switch: the registry row plus whether a card renders it. */
export const AccountDashboardModuleModel = z.strictObject({
	id: z.string(),
	label: z.string(),
	scope: z.string(),
	band: z.string(),
	meaning: z.string(),
	mounted: z.boolean()
});
export type AccountDashboardModuleModel = z.infer<typeof AccountDashboardModuleModel>;

/**
 * The plan card's data — billing's `SubscriptionSummary` shapes. Copied here
 * only because billing's public entry does not carry types yet; the S5 service
 * narrows this to billing's model.
 */
export const AccountPlanTierModel = z.strictObject({
	id: z.string(),
	name: z.string(),
	tierName: z.string(),
	planType: z.string(),
	displayName: z.string(),
	createdAt: isoInstant(),
	updatedAt: isoInstant(),
	durationMonths: z.number().int(),
	enabled: z.boolean(),
	familyLimit: z.number().int(),
	memberLimit: z.number().int(),
	retentionViewDays: z.number().int(),
	archivedRetentionDays: z.number().int(),
	attachmentLimitBytes: z.number().int(),
	aiEventCreationsPerMonth: z.number().int(),
	exportImportEnabled: z.boolean()
});
export type AccountPlanTierModel = z.infer<typeof AccountPlanTierModel>;

export const AccountSubscriptionWindowModel = z.strictObject({
	id: z.string(),
	startDate: isoInstant(),
	endDate: isoInstant(),
	createdAt: isoInstant()
});
export type AccountSubscriptionWindowModel = z.infer<typeof AccountSubscriptionWindowModel>;

export const AccountPlanLimitsModel = z.strictObject({
	familyLimit: z.number().int(),
	memberLimit: z.number().int(),
	retentionViewDays: z.number().int(),
	archivedRetentionDays: z.number().int(),
	attachmentLimitBytes: z.number().int(),
	aiEventCreationsPerMonth: z.number().int(),
	exportImportEnabled: z.boolean()
});
export type AccountPlanLimitsModel = z.infer<typeof AccountPlanLimitsModel>;

export const AccountAiUsageModel = z.strictObject({
	used: z.number().int(),
	limit: z.number().int(),
	remaining: z.number().int()
});
export type AccountAiUsageModel = z.infer<typeof AccountAiUsageModel>;

export const AccountPlanPricingModel = z.strictObject({
	monthly: z.number(),
	annual: z.number(),
	lifetime: z.number(),
	monthlyEquivalent: z.number()
});
export type AccountPlanPricingModel = z.infer<typeof AccountPlanPricingModel>;

/** One family's roster size, for the plan card's usage line. */
export const AccountUsageFamilyModel = z.strictObject({
	id: z.string(),
	memberCount: z.number().int()
});
export type AccountUsageFamilyModel = z.infer<typeof AccountUsageFamilyModel>;

/** One API token row: no hash column ever crosses the wire. */
export const AccountApiTokenModel = z.strictObject({
	id: z.string(),
	name: z.string(),
	createdAt: isoInstant(),
	lastUsedAt: isoInstant().nullable()
});
export type AccountApiTokenModel = z.infer<typeof AccountApiTokenModel>;

/**
 * `200` body of `GET /account/section/[section]`: only that section's data,
 * discriminated by the section it belongs to. A section that needs no read
 * (`security`) still answers its id, so the rail and the body stay one list.
 */
export const AccountSectionModelResponse = z.discriminatedUnion('section', [
	z.strictObject({
		section: z.literal('profile'),
		person: AccountPersonModel
	}),
	z.strictObject({
		section: z.literal('families'),
		families: z.array(AccountFamilyModel)
	}),
	z.strictObject({
		section: z.literal('notifications'),
		preferences: AccountNotificationPreferencesModel,
		options: z.array(AccountNotificationOptionModel)
	}),
	z.strictObject({
		section: z.literal('calendar'),
		settings: AccountCalendarSettingsModel,
		calendars: z.array(AccountCalendarModel),
		consentHistory: z.array(AccountConsentModel)
	}),
	z.strictObject({
		section: z.literal('dashboard'),
		hidden: z.array(z.string()),
		modules: z.array(AccountDashboardModuleModel)
	}),
	z.strictObject({
		section: z.literal('subscription'),
		subscription: z.strictObject({
			tier: AccountPlanTierModel.nullable(),
			subscription: AccountSubscriptionWindowModel.nullable()
		}),
		planLimits: AccountPlanLimitsModel,
		aiUsage: AccountAiUsageModel,
		planPricing: AccountPlanPricingModel,
		families: z.array(AccountUsageFamilyModel)
	}),
	z.strictObject({
		section: z.literal('email'),
		email: z.string().nullable(),
		emailVerified: z.boolean(),
		isAnonymous: z.boolean()
	}),
	z.strictObject({ section: z.literal('security') }),
	z.strictObject({
		section: z.literal('api'),
		tokens: z.array(AccountApiTokenModel)
	}),
	z.strictObject({
		section: z.literal('danger'),
		userId: z.string()
	})
]);
export type AccountSectionModel = z.infer<typeof AccountSectionModelResponse>;

/**
 * What `/account`'s first paint carries: the rail's identity, the default
 * (profile) section's model, and the load's instant — the relative labels the
 * sections print ("last used …", "Resets …") are computed against it.
 */
export type AccountPagePaint = {
	readonly user: AccountPersonModel;
	readonly section: AccountSectionModel;
	readonly now: string;
};
