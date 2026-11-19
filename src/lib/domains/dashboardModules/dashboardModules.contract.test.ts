/**
 * The wire contract: both PUT bodies, their responses and the saved-message
 * copy. The 400 copy and the absent-vs-null rules are the legacy wire, so the
 * golden handlers must parse with exactly these schemas at S6. Expected
 * values come from the legacy routes' `typeof`/`Array.isArray` checks and the
 * goldens (`dashboardModules.http.db.test.ts`), not from running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, z } from '$lib/kernel/validation/validators';
import {
	dashboardModulesSavedMessage,
	FAMILY_MODULE_ENABLED_MESSAGE,
	FamilyModuleSwitchBody,
	FamilyModuleSwitchResponse,
	MY_MODULES_HIDDEN_MESSAGE,
	MyDashboardModulesBody,
	MyDashboardModulesResponse
} from './dashboardModules.contract';

function messageOf(schema: z.ZodType, value: unknown): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

describe('FamilyModuleSwitchBody', () => {
	it.each<boolean>([true, false])('parses enabled: %s', (enabled) => {
		expect(FamilyModuleSwitchBody.parse({ enabled })).toEqual({ enabled });
	});

	it('ignores every other field, like the legacy typeof check', () => {
		expect(FamilyModuleSwitchBody.parse({ enabled: false, module: 'board', extra: 1 })).toEqual({
			enabled: false
		});
	});

	// Golden: `requires a boolean enabled, absent or not`.
	it.each<[string, unknown]>([
		['an absent enabled', {}],
		['a null enabled', { enabled: null }],
		['the string "true"', { enabled: 'true' }],
		['the string "false"', { enabled: 'false' }],
		['the number 1', { enabled: 1 }],
		['the number 0', { enabled: 0 }],
		['an object', { enabled: {} }],
		['an array', { enabled: [true] }],
		['a non-object body', 'enabled'],
		['an array body', [true]]
	])('answers the one 400 copy for %s', (_label, value) => {
		expect(messageOf(FamilyModuleSwitchBody, value)).toBe(FAMILY_MODULE_ENABLED_MESSAGE);
	});

	it('keeps the legacy wording', () => {
		expect(FAMILY_MODULE_ENABLED_MESSAGE).toBe('enabled must be a boolean');
	});
});

describe('FamilyModuleSwitchResponse', () => {
	it('is exactly {success:true}', () => {
		expect(FamilyModuleSwitchResponse.parse({ success: true })).toEqual({ success: true });
		expect(FamilyModuleSwitchResponse.safeParse({ success: false }).success).toBe(false);
		expect(FamilyModuleSwitchResponse.safeParse({}).success).toBe(false);
	});
});

describe('MyDashboardModulesBody', () => {
	it.each<[string, string[]]>([
		['an empty list', []],
		['canonical ids', ['board', 'kids']],
		// Unknown ids are the service's to drop (golden `drops every unknown id and
		// answers 200`), so the schema must not refuse them (Q-029).
		['unknown ids', ['widget', 'memberStrip']],
		['duplicates and a posted order', ['kids', 'board', 'kids']]
	])('parses %s as posted', (_label, hidden) => {
		expect(MyDashboardModulesBody.parse({ hidden })).toEqual({ hidden });
	});

	it('ignores every other field', () => {
		expect(MyDashboardModulesBody.parse({ hidden: ['board'], extra: true })).toEqual({
			hidden: ['board']
		});
	});

	// Golden: `requires an array of module ids`. Legacy: `!Array.isArray(hidden) ||
	// hidden.some((h) => typeof h !== 'string')`; an empty body reads `{}`.
	it.each<[string, unknown]>([
		['an absent hidden (the empty body)', {}],
		['a null hidden', { hidden: null }],
		['a bare string', { hidden: 'board' }],
		['an object', { hidden: { 0: 'board' } }],
		['a number element', { hidden: ['board', 1] }],
		['a null element', { hidden: [null] }],
		['an array element', { hidden: [['board']] }],
		['a non-object body', 'hidden'],
		['an array body', [['board']]]
	])('answers the one 400 copy for %s', (_label, value) => {
		expect(messageOf(MyDashboardModulesBody, value)).toBe(MY_MODULES_HIDDEN_MESSAGE);
	});

	it('keeps the legacy wording', () => {
		expect(MY_MODULES_HIDDEN_MESSAGE).toBe('hidden must be an array of module ids');
	});
});

describe('MyDashboardModulesResponse', () => {
	it('parses the saved answer', () => {
		const wire = {
			success: true,
			message: 'Dashboard modules saved — 6 of 8 cards on.',
			hidden: ['board', 'kids']
		};
		expect(MyDashboardModulesResponse.parse(wire)).toEqual(wire);
	});

	it.each<[string, unknown]>([
		['success false', { success: false, message: 'm', hidden: [] }],
		['a missing message', { success: true, hidden: [] }],
		['a missing hidden', { success: true, message: 'm' }],
		['a non-string id', { success: true, message: 'm', hidden: [1] }]
	])('refuses %s', (_label, value) => {
		expect(MyDashboardModulesResponse.safeParse(value).success).toBe(false);
	});
});

describe('dashboardModulesSavedMessage', () => {
	// Goldens: `saves canonical ids only…` (6 of 8), `replaces an existing hidden
	// list…` (7 of 8) and `creates the settings row…` (all 8).
	it.each<[number, string]>([
		[0, 'Dashboard modules saved — all 8 cards on.'],
		[1, 'Dashboard modules saved — 7 of 8 cards on.'],
		[2, 'Dashboard modules saved — 6 of 8 cards on.'],
		[8, 'Dashboard modules saved — 0 of 8 cards on.']
	])('counts %s hidden as %j', (hiddenCount, expected) => {
		expect(dashboardModulesSavedMessage(hiddenCount)).toBe(expected);
	});
});
