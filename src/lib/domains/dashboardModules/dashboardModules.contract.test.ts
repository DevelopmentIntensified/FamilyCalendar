/**
 * The wire contract: both PUT bodies, their params, responses and the copy the
 * services add. The 400/403 copy and the absent-vs-null rules are the legacy
 * wire, so the golden handlers must parse with exactly these schemas at S6.
 * Expected values come from the legacy routes' `typeof`/`Array.isArray` checks,
 * `readJsonObject` (which refused non-object bodies with `Invalid JSON`) and
 * the goldens (`dashboardModules.http.db.test.ts`), not from running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, INVALID_JSON_MESSAGE, z } from '$lib/kernel/validation/validators';
import {
	dashboardModulesSavedMessage,
	FAMILY_MODULE_ENABLED_MESSAGE,
	FAMILY_MODULE_FORBIDDEN_MESSAGE,
	FAMILY_MODULE_REQUIRED_MESSAGE,
	FamilyModuleParams,
	FamilyModuleSwitchBody,
	FamilyModuleSwitchResponse,
	familyModuleNotFamilyScopedMessage,
	familyModuleUnknownMessage,
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
		['an array', { enabled: [true] }]
	])('answers the one 400 copy for %s', (_label, value) => {
		expect(messageOf(FamilyModuleSwitchBody, value)).toBe(FAMILY_MODULE_ENABLED_MESSAGE);
	});

	// Golden: `answers 400 Invalid JSON for a malformed or non-object body`.
	// Legacy `readJsonObject` refused every non-object with that one sentence.
	it.each<[string, unknown]>([
		['a JSON array', [{ enabled: false }]],
		['a JSON null', null],
		['a JSON string', 'enabled'],
		['a JSON number', 1]
	])('answers "Invalid JSON" for %s (legacy readJsonObject)', (_label, value) => {
		expect(messageOf(FamilyModuleSwitchBody, value)).toBe(INVALID_JSON_MESSAGE);
	});

	it('keeps the legacy wording', () => {
		expect(FAMILY_MODULE_ENABLED_MESSAGE).toBe('enabled must be a boolean');
	});
});

describe('FamilyModuleParams', () => {
	it('passes the route parameters through untouched', () => {
		expect(FamilyModuleParams.parse({ id: 'fam-1', module: 'board' })).toEqual({
			id: 'fam-1',
			module: 'board'
		});
	});

	it('passes an empty module through, so the service owns the 400', () => {
		expect(FamilyModuleParams.parse({ id: 'fam-1', module: '' })).toEqual({
			id: 'fam-1',
			module: ''
		});
	});
});

describe('the switch copy the service adds', () => {
	// Legacy: `familyData.ts:258-268` (the role gate) and `:361` (the module
	// name), then `db/actions/dashboardModules.ts:30-34` (the registry).
	it('keeps the legacy wording verbatim', () => {
		expect([
			FAMILY_MODULE_FORBIDDEN_MESSAGE,
			FAMILY_MODULE_REQUIRED_MESSAGE,
			familyModuleUnknownMessage('weather'),
			familyModuleNotFamilyScopedMessage('verse')
		]).toEqual([
			'You do not have permission to perform this action',
			'Module is required',
			'Unknown dashboard module: weather',
			'Module is not family-scoped: verse'
		]);
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
		['an array element', { hidden: [['board']] }]
	])('answers the one 400 copy for %s', (_label, value) => {
		expect(messageOf(MyDashboardModulesBody, value)).toBe(MY_MODULES_HIDDEN_MESSAGE);
	});

	it.each<[string, unknown]>([
		['a JSON array', [{ hidden: [] }]],
		['a JSON null', null],
		['a JSON string', 'hidden'],
		['a JSON number', 1]
	])('answers "Invalid JSON" for %s (legacy readJsonObject)', (_label, value) => {
		expect(messageOf(MyDashboardModulesBody, value)).toBe(INVALID_JSON_MESSAGE);
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
