/**
 * dashboardModules service: the one visibility read, the family master switch
 * pair (list + admin-only set) and the per-user hide save.
 *
 * Authorization lives here: a family switch is creator/admin only and the role
 * check runs BEFORE the module name, so a plain member cannot probe ids — the
 * frozen golden pins that order. Wire copy comes from `./dashboardModules.contract`
 * and the registry from `./dashboardModules.registry.rules`; this file adds no
 * second copy of either.
 *
 * Identity owns the settings row, so the per-user save and the visibility read
 * go through identity's public interface; the family role comes from family's
 * own `getViewerRole` (rank 4 < 5, so a direct import — no port). Time comes
 * from `ctx.clock`, ids from the registry.
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { forbidden, invalid } from '$lib/kernel/errors/appError';
import { getViewerRole } from '$lib/domains/family/index.server';
import { getCalendarSettings, setHiddenDashboardModules } from '$lib/domains/identity/index.server';
import {
	dashboardModulesSavedMessage,
	FAMILY_MODULE_FORBIDDEN_MESSAGE,
	FAMILY_MODULE_REQUIRED_MESSAGE,
	familyModuleNotFamilyScopedMessage,
	familyModuleUnknownMessage
} from './dashboardModules.contract';
import {
	DASHBOARD_MODULES,
	canonicalHiddenModules,
	type DashboardModuleId,
	type ModuleSwitchMap
} from './dashboardModules.registry.rules';
import { readFamilyModuleSwitches, writeFamilyModuleSwitch } from './dashboardModules.repo.server';
import { dashboardVisibility, type DashboardVisibility } from './dashboardModules.visibility.rules';
import type { DashboardModulesVisibilityCtx } from './index.server';

/** The one input of the visibility read: whose family switches apply. */
export type DashboardVisibilityInput = {
	readonly familyId: string;
};

/** The family switch route's validated input (the body's boolean plus the two URL parts). */
export type FamilyModuleSwitchInput = {
	readonly familyId: string;
	readonly module: string;
	readonly enabled: boolean;
};

/** The per-user save's posted list: canonicalized before anything is written. */
export type HiddenModulesInput = {
	readonly hidden: readonly string[];
};

/** What the per-user save answers: the stored list and the wire's card count. */
export type HiddenModulesResult = {
	readonly hidden: readonly DashboardModuleId[];
	readonly message: string;
};

/**
 * The `/api/dashboard` read: identity's settings row plus this module's family
 * switches, composed by the pure `dashboardVisibility`. One call per loader, so
 * no page composes the two booleans again.
 */
export async function getDashboardVisibility(
	ctx: DashboardModulesVisibilityCtx,
	actor: Actor,
	input: DashboardVisibilityInput
): Promise<DashboardVisibility> {
	const [{ settings }, familySwitches] = await Promise.all([
		getCalendarSettings(ctx, actor),
		readFamilyModuleSwitches(ctx.db, input.familyId)
	]);
	return dashboardVisibility({
		// The defaults view means "no settings row saved", which the composition
		// reads as no facts: nothing hidden, and no verse.
		settings: 'hiddenDashboardModules' in settings ? settings : null,
		familySwitches
	});
}

/**
 * The persisted half alone: every family-scoped id seeded `true`, then the OFF
 * rows applied. `family` reads it through its `moduleSwitches` port (Q-030) and
 * `getDashboardVisibility` composes it, so there is one read of these rows.
 */
export async function listFamilyModuleSwitches(
	ctx: Ctx,
	familyId: string
): Promise<ModuleSwitchMap> {
	return await readFamilyModuleSwitches(ctx.db, familyId);
}

/**
 * Flip one family master switch. Only the creator or an admin may; the role
 * check runs before the module name (so a member cannot probe ids), an empty
 * name is refused next, then the registry decides unknown vs personal. A row
 * exists only while OFF, so enabling deletes it.
 */
export async function setFamilyModuleSwitch(
	ctx: Ctx,
	actor: Actor,
	input: FamilyModuleSwitchInput
): Promise<void> {
	const role = await getViewerRole(ctx, actor.id, input.familyId);
	if (role !== 'creator' && role !== 'admin') throw forbidden(FAMILY_MODULE_FORBIDDEN_MESSAGE);
	if (!input.module) throw invalid(FAMILY_MODULE_REQUIRED_MESSAGE);

	const entry = DASHBOARD_MODULES.find((module) => module.id === input.module);
	if (!entry) throw invalid(familyModuleUnknownMessage(input.module));
	if (entry.scope !== 'family') throw invalid(familyModuleNotFamilyScopedMessage(input.module));

	await writeFamilyModuleSwitch(ctx.db, {
		familyId: input.familyId,
		module: entry.id,
		enabled: input.enabled,
		now: ctx.clock.now()
	});
}

/**
 * The per-user hide save (#105): canonical ids only, in registry order, unknown
 * and retired ids dropped silently (Q-029), written through identity — the
 * settings row is not ours. Answers the stored list and the wire's message.
 */
export async function saveHiddenModules(
	ctx: Ctx,
	actor: Actor,
	input: HiddenModulesInput
): Promise<HiddenModulesResult> {
	const hidden = canonicalHiddenModules(input.hidden);
	await setHiddenDashboardModules(ctx, actor, hidden);
	return { hidden, message: dashboardModulesSavedMessage(hidden.length) };
}
