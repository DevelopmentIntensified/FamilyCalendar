/**
 * The detail page's state class: the member gates, the settings re-seed rule,
 * the role/Member Type/remove toasts and the optimistic Dashboard Module flip
 * with its revert. No DOM, no `$effect` — a fake `refresh` and `memoryToasts()`.
 *
 * Doc: ./README.md#invariants
 */
import type { SubmitFunction } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import { FamilyHubState } from './familyHub.detail.state.svelte';
import { buildFamilyHubMember, buildFamilyHubModel } from './familyHub.ui.fixtures';

const FALLBACK = '#c45e38';

function buildState(overrides: Parameters<typeof buildFamilyHubModel>[0] = {}) {
	const toasts = memoryToasts();
	const refresh = vi.fn(async () => {});
	const state = new FamilyHubState({
		toasts,
		refresh,
		data: buildFamilyHubModel(overrides),
		fallbackColor: FALLBACK
	});
	return { state, toasts, refresh };
}

/** Run one of the class's `enhance` callbacks: the action's result, then settle. */
async function settle(submit: SubmitFunction, type: 'success' | 'failure') {
	const update = vi.fn(async () => {});
	const after = submit({ formData: new FormData() } as never);
	await (after as (input: unknown) => Promise<void>)({ result: { type }, update });
	return update;
}

describe('FamilyHubState member gates', () => {
	it('gates Edit and Remove to other members only', () => {
		const { state } = buildState();
		const self = buildFamilyHubMember({ userId: 'u_ann', role: 'creator' });
		const other = buildFamilyHubMember({ userId: 'u_bob', role: 'member' });
		const creator = buildFamilyHubMember({ userId: 'u_zed', role: 'creator' });

		expect(state.canEdit(self)).toBe(false);
		expect(state.canRemove(self)).toBe(false);
		expect(state.canEdit(other)).toBe(true);
		expect(state.canRemove(other)).toBe(true);
		// A creator may open another creator's role editor (the server refuses a
		// role change, and Remove is never offered on a creator).
		expect(state.canEdit(creator)).toBe(true);
		expect(state.canRemove(creator)).toBe(false);
	});

	it('shows no admin control to a plain member', () => {
		const { state } = buildState({
			currentUserRole: 'member',
			currentUserId: 'u_bob'
		});
		expect(state.isAdmin).toBe(false);
		expect(state.canEdit(buildFamilyHubMember({ userId: 'u_ann', role: 'creator' }))).toBe(false);
		expect(state.mayActOn(buildFamilyHubMember({ userId: 'u_ann', role: 'creator' }))).toBe(false);
	});
});

describe('FamilyHubState settings seed', () => {
	it('keeps the half-typed name when an unrelated reload arrives', () => {
		const { state } = buildState();
		state.editingName = 'Old Ho';
		state.sync(buildFamilyHubModel({ activity: [] }));
		expect(state.editingName).toBe('Old Ho');
	});

	it('re-seeds on a rename and falls back to the palette colour', () => {
		const { state } = buildState();
		state.sync(buildFamilyHubModel({ family: { id: 'fam-old', name: 'New Home', color: null, createdAt: new Date() } }));
		expect(state.editingName).toBe('New Home');
		expect(state.editingColor).toBe(FALLBACK);
	});
});

describe('FamilyHubState action feedback', () => {
	it('toasts the family settings save both ways', async () => {
		const { state, toasts } = buildState();
		await settle(state.saveFamilySubmit, 'success');
		expect(toasts.items).toContainEqual({ kind: 'success', text: 'Family settings saved.' });
		await settle(state.saveFamilySubmit, 'failure');
		expect(toasts.items).toContainEqual({
			kind: 'error',
			text: "Couldn't save family settings — try again."
		});
	});

	it('settles a role save and closes the editor', async () => {
		const { state, toasts, refresh } = buildState();
		const member = buildFamilyHubMember({ userId: 'u_bob' });
		state.startEditRole(member.userId);
		await settle(state.roleSubmit(member), 'success');
		expect(toasts.items).toContainEqual({ kind: 'success', text: 'Role updated.' });
		expect(state.editingRole).toBeNull();
		expect(state.roleBusy).toBeNull();
		expect(refresh).toHaveBeenCalled();
	});

	it('flags a row busy only once its form submits, never when the template builds the callback', () => {
		const { state } = buildState();
		const member = buildFamilyHubMember({ userId: 'u_bob' });
		const role = state.roleSubmit(member);
		const remove = state.removeSubmit(member);
		expect(state.roleBusy).toBeNull();
		expect(state.removeBusy).toBeNull();
		role({ formData: new FormData() } as never);
		remove({ formData: new FormData() } as never);
		expect(state.roleBusy).toBe('u_bob');
		expect(state.removeBusy).toBe('u_bob');
	});

	it('explains a refused Member Type change', async () => {
		const { state, toasts } = buildState();
		await settle(state.memberTypeSubmit, 'failure');
		expect(toasts.items).toContainEqual({
			kind: 'error',
			text: "Couldn't update member type — try again."
		});
		expect(state.memberTypeBusy).toBeNull();
	});

	it('closes the remove ask and the sheet after a removal', async () => {
		const { state, toasts } = buildState();
		const member = buildFamilyHubMember({ userId: 'u_bob' });
		state.startRemoveAsk(member.userId);
		state.openSheet(member);
		await settle(state.removeSubmit(member), 'success');
		expect(toasts.items).toContainEqual({
			kind: 'success',
			text: 'Member removed from the family.'
		});
		expect(state.removeAskId).toBeNull();
		expect(state.sheetMember).toBeNull();
	});
});

describe('FamilyHubState module switches', () => {
	it('acknowledges the flip before the request leaves', () => {
		const { state } = buildState();
		const module = state.familyModules.find((entry) => entry.id === 'board');
		if (!module) throw new Error('board module missing from the registry');
		expect(state.moduleState(module)).toBe('off');
		state.optimisticModuleFlip(module);
		expect(state.moduleState(module)).toBe('on');
		expect(state.modulePending).toBe('board');
		// The row still posts the opposite of the SERVER's switch.
		expect(state.moduleSubmitValue(module)).toBe('true');
	});

	it('a refused switch reverts and explains', async () => {
		const { state, toasts } = buildState();
		const module = state.familyModules.find((entry) => entry.id === 'board');
		if (!module) throw new Error('board module missing from the registry');
		state.optimisticModuleFlip(module);
		await settle(state.moduleSubmit(module), 'failure');
		expect(state.moduleState(module)).toBe('off');
		expect(state.modulePending).toBeNull();
		expect(toasts.items).toContainEqual({
			kind: 'error',
			text: "Couldn't switch family task board — try again."
		});
	});

	it('confirms the new state after a successful switch', async () => {
		const { state, toasts } = buildState();
		const module = state.familyModules.find((entry) => entry.id === 'kids');
		if (!module) throw new Error('kids module missing from the registry');
		state.optimisticModuleFlip(module);
		await settle(state.moduleSubmit(module), 'success');
		expect(toasts.items).toContainEqual({ kind: 'success', text: "Kids' Schedule is now on for everyone." });
	});
});
