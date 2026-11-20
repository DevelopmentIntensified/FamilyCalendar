/**
 * dashboardModules contract: the wire bodies, responses and copy for the two
 * `/api` PUT routes. `readJsonObject` (kernel/http) owns the
 * `400 {"error":"Invalid JSON"}` refusal before these schemas see a value; the
 * schemas own the two field messages the goldens pin, verbatim.
 *
 * The registry entry type and the id vocabulary live with the registry, not
 * here (see `dashboardModules.registry.rules.ts`).
 *
 * Doc: ./README.md#invariants
 */
import { z } from '$lib/kernel/validation/validators';
import { DASHBOARD_MODULES } from './dashboardModules.registry.rules';

/** The one 400 body `PUT /api/families/{id}/modules/{module}` uses for a non-boolean. */
export const FAMILY_MODULE_ENABLED_MESSAGE = 'enabled must be a boolean';

/** The one 400 body `PUT /api/me/dashboard-modules` uses for a malformed list. */
export const MY_MODULES_HIDDEN_MESSAGE = 'hidden must be an array of module ids';

/**
 * `PUT /api/families/{id}/modules/{module}`. `enabled` is required and must be
 * a boolean: absent, `null` and every other type are the same refusal, exactly
 * like the legacy route's `typeof` check. Other fields are ignored.
 */
export const FamilyModuleSwitchBody = z.object(
	{ enabled: z.boolean({ error: FAMILY_MODULE_ENABLED_MESSAGE }) },
	{ error: FAMILY_MODULE_ENABLED_MESSAGE }
);
export type FamilyModuleSwitchBody = z.infer<typeof FamilyModuleSwitchBody>;

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
	{ error: MY_MODULES_HIDDEN_MESSAGE }
);
export type MyDashboardModulesBody = z.infer<typeof MyDashboardModulesBody>;

/** `200 {success:true, message, hidden}` — `hidden` is the canonical saved list. */
export const MyDashboardModulesResponse = z.object({
	success: z.literal(true),
	message: z.string(),
	hidden: z.array(z.string())
});
export type MyDashboardModulesResponse = z.infer<typeof MyDashboardModulesResponse>;

/**
 * The per-user save's `message`: the count of cards still on, out of the
 * canonical registry. Wire copy, so it has one home here rather than in the
 * service that composes the response.
 */
export function dashboardModulesSavedMessage(hiddenCount: number): string {
	return hiddenCount
		? `Dashboard modules saved — ${DASHBOARD_MODULES.length - hiddenCount} of ${DASHBOARD_MODULES.length} cards on.`
		: `Dashboard modules saved — all ${DASHBOARD_MODULES.length} cards on.`;
}
