/**
 * familyHub detail state — the `/family/[familyId]` page's behaviour: which
 * member row is editing its role, which one has the remove ask open, the mobile
 * action sheet, the settings band's name/colour fields (re-seeded only when the
 * server's `id|name|color` changes), the inline Member Type/role/remove
 * submissions, the optimistic Dashboard Module flips and every toast the page
 * prints.
 *
 * No `$effect` and no DOM: the component calls `sync()` with each new load
 * answer, and the framework's `enhance` callbacks are built here so the class
 * is tested in node with `memoryToasts()`. Copy comes from the legacy page
 * (`family/[familyId]/+page.svelte:100-260,618-700`).
 *
 * Doc: ./README.md#invariants
 */
import type { SubmitFunction } from '@sveltejs/kit';
import type { Toasts } from '$lib/kernel/client/toasts.svelte';
import { canEditRole, canRemove, rolePillClass } from '$lib/domains/family/index';
import {
	dashboardModuleToggleValue,
	describeDashboardModuleRow,
	selectDashboardModules,
	type DashboardModule,
	type ModuleRowState
} from '$lib/domains/dashboardModules/index';
import type { FamilyHubMember, FamilyHubModel } from './familyHub.contract';
import { seedFamilySettings } from './familyHub.detail.rules';

/**
 * The `$app/forms` `enhance` action, structurally: a form node in and the
 * submit callback out. The route passes the real one down, so no screen
 * component imports `$app/*` (port-ui.md).
 */
export type FamilyHubFormEnhancer = (
	node: HTMLFormElement,
	submit: SubmitFunction
) => { destroy(): void };

/** A no-op action: a plain form still submits (the components' test default). */
export const familyHubPlainForm: FamilyHubFormEnhancer = () => ({ destroy: () => {} });

export type FamilyHubStateOptions = {
	readonly toasts: Toasts;
	/** Re-reads the page's load data (SvelteKit `invalidateAll`). */
	readonly refresh: () => Promise<void>;
	readonly data: FamilyHubModel;
	/** The palette default a colourless family falls back to (Q-086). */
	readonly fallbackColor: string;
};

/** The family-scoped master switches this band edits, in registry order. */
const FAMILY_MODULES: readonly DashboardModule[] = selectDashboardModules({ scope: 'family' });

export class FamilyHubState {
	/** The server's answer; the component re-seeds it through `sync()`. */
	private current = $state.raw<FamilyHubModel | null>(null);

	get data(): FamilyHubModel {
		if (!this.current) throw new Error('FamilyHubState: data was never set');
		return this.current;
	}

	/** The member whose role form is open (desktop row or the sheet). */
	editingRole = $state<string | null>(null);
	/** The member whose inline "Remove?" ask is open. */
	removeAskId = $state<string | null>(null);
	/** The member whose mobile action sheet is open. */
	sheetMember = $state<FamilyHubMember | null>(null);

	/** The settings band's two fields, and the filename they were seeded from. */
	editingName = $state('');
	editingColor = $state('');
	private seededFamilyKey: string | null = null;

	savingFamily = $state(false);
	memberTypeBusy = $state<string | null>(null);
	roleBusy = $state<string | null>(null);
	removeBusy = $state<string | null>(null);

	/** The module whose flip is in flight. */
	modulePending = $state<string | null>(null);
	/** Module id → the state the row shows ahead of the server's answer. */
	moduleOptimistic = $state<Record<string, ModuleRowState>>({});

	private readonly toasts: Toasts;
	private readonly refresh: () => Promise<void>;
	private readonly fallbackColor: string;

	constructor(options: FamilyHubStateOptions) {
		this.toasts = options.toasts;
		this.refresh = options.refresh;
		this.fallbackColor = options.fallbackColor;
		this.current = options.data;
		this.seed();
	}

	/** Take the page's new load answer: rows settle on the server's truth. */
	sync(data: FamilyHubModel): void {
		this.current = data;
		this.seed();
	}

	/**
	 * Re-seed the settings inputs only when the server's `id|name|color`
	 * changed, so an unrelated reload (a member removed, a switch flipped) never
	 * clobbers a half-typed name.
	 */
	private seed(): void {
		const seeded = seedFamilySettings(
			this.seededFamilyKey,
			this.data.family,
			{ name: this.editingName, color: this.editingColor },
			this.fallbackColor
		);
		this.seededFamilyKey = seeded.key;
		if (seeded.fields.name !== this.editingName) this.editingName = seeded.fields.name;
		if (seeded.fields.color !== this.editingColor) this.editingColor = seeded.fields.color;
	}

	/** Admins are the creator and every admin: the page's one gate. */
	get isAdmin(): boolean {
		return this.data.currentUserRole === 'creator' || this.data.currentUserRole === 'admin';
	}

	/** The role pill's tone: amber creator, emerald admin, blue member. */
	pillClass(role: string | null): string {
		return rolePillClass(role || 'member');
	}

	/** May the viewer change this member's role? Never their own. */
	canEdit(member: FamilyHubMember): boolean {
		return canEditRole(member, this.data.currentUserRole, this.data.currentUserId);
	}

	/** May the viewer remove this member? Never themselves, never a creator. */
	canRemove(member: FamilyHubMember): boolean {
		return canRemove(member, this.data.currentUserRole, this.data.currentUserId);
	}

	/** Any admin action a member row offers (the mobile sheet's own gate). */
	mayActOn(member: FamilyHubMember): boolean {
		return this.isAdmin || this.canEdit(member) || this.canRemove(member);
	}

	startEditRole(userId: string): void {
		this.editingRole = userId;
	}

	cancelEditRole(): void {
		this.editingRole = null;
	}

	startRemoveAsk(userId: string): void {
		this.removeAskId = userId;
	}

	cancelRemoveAsk(): void {
		this.removeAskId = null;
	}

	openSheet(member: FamilyHubMember): void {
		this.removeAskId = null;
		this.sheetMember = member;
	}

	closeSheet(): void {
		this.sheetMember = null;
		this.removeAskId = null;
	}

	// --- The forms' enhance callbacks ----------------------------------------

	/** A member-type select submits its own form; this flags the row meanwhile. */
	startMemberTypeChange(member: FamilyHubMember): void {
		this.memberTypeBusy = member.userId;
	}

	/** The settings band: "Saving…" while in flight, then a toast either way. */
	saveFamilySubmit: SubmitFunction = () => {
		this.savingFamily = true;
		return async ({ result, update }) => {
			this.savingFamily = false;
			if (result.type === 'success') this.toasts.success('Family settings saved.');
			else if (result.type === 'failure') {
				this.toasts.error("Couldn't save family settings — try again.");
			}
			await update();
		};
	};

	/** Member Type: admin-only; the select already carries the new value. */
	memberTypeSubmit: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') this.toasts.success('Member type updated.');
			else if (result.type === 'failure') {
				this.toasts.error("Couldn't update member type — try again.");
			}
			await update();
			await this.refresh();
			this.memberTypeBusy = null;
		};
	};

	/**
	 * The role form (row or sheet): busy on that member while in flight, then the
	 * toast and a settle. The busy flag is set when the form SUBMITS, never when
	 * the template builds the callback (a render-time flag disabled every row's
	 * button before anyone pressed it).
	 */
	roleSubmit(member: FamilyHubMember): SubmitFunction {
		return () => {
			this.roleBusy = member.userId;
			return async ({ result, update }) => {
				if (result.type === 'success') this.toasts.success('Role updated.');
				else if (result.type === 'failure') {
					this.toasts.error("Couldn't update role — try again.");
				}
				await update();
				await this.refresh();
				this.editingRole = null;
				this.roleBusy = null;
				this.sheetMember = null;
			};
		};
	}

	/** The remove form (row or sheet): confirm first, then busy while in flight, the toast and a settle. */
	removeSubmit(member: FamilyHubMember): SubmitFunction {
		return () => {
			this.removeBusy = member.userId;
			return async ({ result, update }) => {
				if (result.type === 'success') {
					this.toasts.success('Member removed from the family.');
				} else if (result.type === 'failure') {
					this.toasts.error("Couldn't remove member — try again.");
				}
				await update();
				await this.refresh();
				this.removeAskId = null;
				this.removeBusy = null;
				this.sheetMember = null;
			};
		};
	}

	// --- Dashboard Module switches (#077) ------------------------------------

	/** The registry's family rows, in order, as the band lists them. */
	get familyModules(): readonly DashboardModule[] {
		return FAMILY_MODULES;
	}

	/** The row's state, the optimistic override winning until the server answers. */
	moduleState(module: DashboardModule): ModuleRowState {
		return (
			this.moduleOptimistic[module.id] ??
			describeDashboardModuleRow({
				scope: module.scope,
				enabled: this.data.moduleSwitches[module.id] ?? true,
				hiddenForViewer: this.data.hiddenDashboardModules.includes(module.id)
			}).state
		);
	}

	/** What the row's button posts: the opposite of the current switch. */
	moduleSubmitValue(module: DashboardModule): 'true' | 'false' {
		return dashboardModuleToggleValue(this.data.moduleSwitches[module.id] ?? true);
	}

	/** Ack in the same tick: flip the row before the request is even sent. */
	optimisticModuleFlip(module: DashboardModule): void {
		this.modulePending = module.id;
		this.moduleOptimistic = {
			...this.moduleOptimistic,
			[module.id]: this.moduleState(module) === 'on' ? 'off' : 'on'
		};
	}

	/** Clear the optimistic flip — the row settles on the server's truth. */
	settleModule(module: DashboardModule): void {
		const next = { ...this.moduleOptimistic };
		delete next[module.id];
		this.moduleOptimistic = next;
		this.modulePending = null;
	}

	/**
	 * A module switch: acknowledged on click (the row flips), reverted with an
	 * explanation when the server refuses, confirmed with its new state when it
	 * does not.
	 */
	moduleSubmit(module: DashboardModule): SubmitFunction {
		return () => {
			return async ({ result, update }) => {
				if (result.type === 'failure') {
					this.settleModule(module);
					this.toasts.error(`Couldn't switch ${module.label.toLowerCase()} — try again.`);
				}
				await update();
				this.settleModule(module);
				if (result.type !== 'success') return;
				const enabled = this.data.moduleSwitches[module.id] ?? true;
				this.toasts.success(`${module.label} is now ${enabled ? 'on' : 'off'} for everyone.`);
			};
		};
	}
}
