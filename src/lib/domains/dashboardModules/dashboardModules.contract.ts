/**
 * dashboardModules contract: the wire bodies, params, responses and copy for
 * the two `/api` PUT routes.
 *
 * Legacy read every body with `readJsonObject` (`src/lib/server/utils/jsonBody.ts`),
 * which answered `400 {"error":"Invalid JSON"}` for malformed JSON *and* for a
 * body that is not an object (an array included). `endpoint()`'s reader already
 * owns the malformed case, so each body schema carries the same sentence as its
 * object-level `error` — a non-object body reaches the schema and is refused
 * with it, while a missing/wrong field keeps the field's own copy.
 *
 * The registry entry type and the id vocabulary live with the registry, not
 * here (see `dashboardModules.registry.rules.ts`).
 *
 * Doc: ./README.md#invariants
 */
import { INVALID_JSON_MESSAGE, z } from '$lib/kernel/validation/validators';
import { FAMILY_MODULE_ENABLED_MESSAGE, MY_MODULES_HIDDEN_MESSAGE } from './dashboardModules.messages.rules';

/**
 * The copy for both routes lives in `dashboardModules.messages.rules.ts` (the
 * entry exports it from there, so a page that only needs a label never loads
 * the schema library). Re-exported here so the module's contract still answers
 * to the names the goldens and services already import from it.
 */
export {
	FAMILY_MODULE_ENABLED_MESSAGE,
	FAMILY_MODULE_FORBIDDEN_MESSAGE,
	FAMILY_MODULE_REQUIRED_MESSAGE,
	familyModuleUnknownMessage,
	familyModuleNotFamilyScopedMessage,
	MY_MODULES_HIDDEN_MESSAGE,
	dashboardModulesSavedMessage
} from './dashboardModules.messages.rules';

/**
 * `PUT /api/families/{id}/modules/{module}`. `enabled` is required and must be
 * a boolean: absent, `null` and every other type are the same refusal, exactly
 * like the legacy route's `typeof` check. Other fields are ignored; a body that
 * is not an object is `Invalid JSON`, like `readJsonObject`.
 */
export const FamilyModuleSwitchBody = z.object(
	{ enabled: z.boolean({ error: FAMILY_MODULE_ENABLED_MESSAGE }) },
	{ error: INVALID_JSON_MESSAGE }
);
export type FamilyModuleSwitchBody = z.infer<typeof FamilyModuleSwitchBody>;

/** The `{id}/{module}` route parameters. Any strings pass; the service owns both checks. */
export const FamilyModuleParams = z.object({ id: z.string(), module: z.string() });
export type FamilyModuleParams = z.infer<typeof FamilyModuleParams>;

/** `200 {success:true}` — the switch writes no row while ON, so nothing else is reported. */
export const FamilyModuleSwitchResponse = z.object({ success: z.literal(true) });
export type FamilyModuleSwitchResponse = z.infer<typeof FamilyModuleSwitchResponse>;

/**
 * `PUT /api/me/dashboard-modules`. `hidden` must be an array whose elements are
 * all strings: absent, `null`, a bare string or a non-string element all get
 * the one message. Unknown ids are accepted here and dropped by the service
 * (golden `drops every unknown id and answers 200`).
 */
export const MyDashboardModulesBody = z.object(
	{
		hidden: z.array(z.string({ error: MY_MODULES_HIDDEN_MESSAGE }), {
			error: MY_MODULES_HIDDEN_MESSAGE
		})
	},
	{ error: INVALID_JSON_MESSAGE }
);
export type MyDashboardModulesBody = z.infer<typeof MyDashboardModulesBody>;

/** `200 {success:true, message, hidden}` — `hidden` is the canonical saved list. */
export const MyDashboardModulesResponse = z.object({
	success: z.literal(true),
	message: z.string(),
	hidden: z.array(z.string())
});
export type MyDashboardModulesResponse = z.infer<typeof MyDashboardModulesResponse>;
