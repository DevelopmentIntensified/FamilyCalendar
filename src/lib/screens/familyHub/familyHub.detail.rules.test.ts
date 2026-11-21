/**
 * Pure detail rules: the seed key, the seed decision, the invite "Uses" cell,
 * the AI bar's width and one Recent Activity line. Expected values are the
 * legacy page's own rendering (`src/routes/(family)/family/[familyId]/+page.svelte`)
 * and the README's Invariants 9, 20, 22 and 23 — never this implementation.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	ACTIVITY_EMPTY_MESSAGE,
	activityLine,
	aiUsagePercent,
	familySettingsKey,
	inviteUsesLabel,
	seedFamilySettings,
	type ActivityLineItem,
	type FamilySettingsFields,
	type FamilySettingsSource
} from './familyHub.detail.rules';

/** The palette default `family` declares (`family.palette.rules.ts`): terracotta. */
const FALLBACK_COLOR = '#c45e38';

/** A seeded family, with a palette colour that differs from the fallback. */
const FAMILY: FamilySettingsSource = { id: 'fam-old', name: 'Old Home', color: '#4d9c85' };

type KeyCase = [string, FamilySettingsSource, string];

describe('familySettingsKey', () => {
	// Legacy `+page.svelte:83`: `${family?.id}|${family?.name}|${family?.color}`.
	it.each<KeyCase>([
		['joins the three fields with a pipe', FAMILY, 'fam-old|Old Home|#4d9c85'],
		['spells a missing colour as null, so it can still change', { ...FAMILY, color: null }, 'fam-old|Old Home|null'],
		['makes a rename a different key', { ...FAMILY, name: 'New Home' }, 'fam-old|New Home|#4d9c85'],
		['makes a recolour a different key', { ...FAMILY, color: '#b45309' }, 'fam-old|Old Home|#b45309']
	])('%s', (_title, family, expected) => {
		expect(familySettingsKey(family)).toBe(expected);
	});
});

type SeedCase = [
	string,
	string | null,
	FamilySettingsSource,
	FamilySettingsFields,
	FamilySettingsFields
];

describe('seedFamilySettings', () => {
	// Legacy `+page.svelte:76-89`: the reactive block re-seeds only when the
	// key changed, so a reload cannot clobber a half-typed name.
	it.each<SeedCase>([
		[
			'the first render seeds both fields from the server',
			null,
			FAMILY,
			{ name: '', color: FALLBACK_COLOR },
			{ name: 'Old Home', color: '#4d9c85' }
		],
		[
			'a reload with the same family keeps the half-typed name',
			familySettingsKey(FAMILY),
			FAMILY,
			{ name: 'Old H', color: '#4d9c85' },
			{ name: 'Old H', color: '#4d9c85' }
		],
		[
			'a rename on the server reseeds the name',
			familySettingsKey(FAMILY),
			{ ...FAMILY, name: 'New Home' },
			{ name: 'Old H', color: '#4d9c85' },
			{ name: 'New Home', color: '#4d9c85' }
		],
		[
			'a recolour on the server reseeds the colour',
			familySettingsKey(FAMILY),
			{ ...FAMILY, color: '#8d7aa8' },
			{ name: 'Old Home', color: '#4d9c85' },
			{ name: 'Old Home', color: '#8d7aa8' }
		],
		[
			'a colourless family gets the palette default, not a blank input',
			null,
			{ ...FAMILY, color: null },
			{ name: '', color: FALLBACK_COLOR },
			{ name: 'Old Home', color: FALLBACK_COLOR }
		],
		[
			'an empty server name stays empty rather than inventing one',
			null,
			{ ...FAMILY, name: '' },
			{ name: 'typed', color: FALLBACK_COLOR },
			{ name: '', color: '#4d9c85' }
		],
		[
			'a different family reseeds even when the name matches',
			familySettingsKey(FAMILY),
			{ ...FAMILY, id: 'fam-new' },
			{ name: 'Old H', color: '#4d9c85' },
			{ name: 'Old Home', color: '#4d9c85' }
		]
	])('%s', (_title, previousKey, family, current, expected) => {
		const seed = seedFamilySettings(previousKey, family, current, FALLBACK_COLOR);
		expect(seed.fields).toEqual(expected);
		expect(seed.key).toBe(familySettingsKey(family));
	});

	it('hands back the key it seeded from, so the next reload can compare', () => {
		const seed = seedFamilySettings(null, FAMILY, { name: '', color: '' }, FALLBACK_COLOR);
		expect(seed.key).toBe('fam-old|Old Home|#4d9c85');
	});
});

type UsesCase = [string, { useCount: number; maxUses: number | null }, string];

describe('inviteUsesLabel', () => {
	// Legacy `+page.svelte:843`: `{activeInvite.useCount} of {activeInvite.maxUses ?? '∞'}`.
	it.each<UsesCase>([
		['a capped code counts against its cap', { useCount: 2, maxUses: 10 }, '2 of 10'],
		['a code nobody has used yet says so', { useCount: 0, maxUses: 5 }, '0 of 5'],
		['an uncapped code shows the infinity sign', { useCount: 3, maxUses: null }, '3 of ∞'],
		['a zero cap stays zero — it is a cap, not "unlimited"', { useCount: 0, maxUses: 0 }, '0 of 0']
	])('%s', (_title, invite, expected) => {
		expect(inviteUsesLabel(invite)).toBe(expected);
	});
});

type PercentCase = [string, number, number, number];

describe('aiUsagePercent', () => {
	// Legacy `+page.svelte:52-53`: `limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0`.
	it.each<PercentCase>([
		['an unknown limit is an empty bar, not a division by zero', 5, 0, 0],
		['a negative limit (unknown) is an empty bar too', 5, -1, 0],
		['no usage is an empty bar', 0, 100, 0],
		['rounds to the nearest whole percent', 1, 3, 33],
		['rounds up from a half', 2, 3, 67],
		['a quarter of the allowance is 25', 250, 1000, 25],
		['exactly at the limit is a full bar', 1000, 1000, 100],
		['over the limit is clamped to a full bar', 500, 200, 100]
	])('%s', (_title, used, limit, expected) => {
		expect(aiUsagePercent(used, limit)).toBe(expected);
	});
});

describe('activityLine', () => {
	// Legacy `+page.svelte:589-616` and README Invariant 23.
	it('labels a completion and an assignment', () => {
		const completion: ActivityLineItem = {
			kind: 'completed',
			actorName: 'Ann',
			title: 'Mow the lawn'
		};
		expect(activityLine(completion)).toBe("✅ Ann completed 'Mow the lawn'");

		const assignment: ActivityLineItem = {
			kind: 'assigned',
			actorName: 'Ann',
			title: 'Mow the lawn',
			targetName: 'Bob'
		};
		expect(activityLine(assignment)).toBe("📋 Ann assigned 'Mow the lawn' to Bob");
	});

	it('leaves off " to …" when the handoff records no target', () => {
		expect(activityLine({ kind: 'assigned', actorName: 'Ann', title: 'Mow the lawn' })).toBe(
			"📋 Ann assigned 'Mow the lawn'"
		);
		expect(
			activityLine({ kind: 'assigned', actorName: 'Ann', title: 'Mow the lawn', targetName: '' })
		).toBe("📋 Ann assigned 'Mow the lawn'");
	});

	it('keeps the title verbatim, apostrophes included', () => {
		expect(activityLine({ kind: 'completed', actorName: 'Ann', title: "Mom's call" })).toBe(
			"✅ Ann completed 'Mom's call'"
		);
	});

	it('words the empty feed once', () => {
		expect(ACTIVITY_EMPTY_MESSAGE).toBe(
			'No activity yet — complete something to get things moving.'
		);
	});
});
