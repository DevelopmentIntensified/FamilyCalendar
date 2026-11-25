/**
 * The Quick Add parser gate, pinned on and off: only an explicit `false`
 * disables the auto-parse (legacy `=== false`), and only an explicit `false`
 * opts out of the cloud path (legacy `?? true`).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { calendarQuickAddSettings } from './calendarPage.quickAdd.rules';

describe('calendarQuickAddSettings', () => {
	it.each([
		['unset (no settings row)', null, null, true, true],
		['both on', true, true, true, true],
		['auto-parse off, cloud on', false, true, false, true],
		['auto-parse on, cloud off', true, false, true, false],
		['both off', false, false, false, false]
	])(
		'%s',
		(
			_label: string,
			autoParseEventDetails: boolean | null,
			useCloudAI: boolean | null,
			expectedAutoParse: boolean,
			expectedUseCloud: boolean
		) => {
			expect(calendarQuickAddSettings({ autoParseEventDetails, useCloudAI })).toEqual({
				autoParse: expectedAutoParse,
				useCloud: expectedUseCloud
			});
		}
	);

	it('parses on an absent switch and keeps the phrase local only on an explicit false', () => {
		expect(
			calendarQuickAddSettings({
				autoParseEventDetails: undefined as unknown as boolean | null,
				useCloudAI: undefined as unknown as boolean | null
			})
		).toEqual({ autoParse: true, useCloud: true });
	});
});
