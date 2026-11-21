/**
 * The Calendar section's data: the five views in the approved order, the zone
 * list (labels de-underscored, sorted, UTC when the browser has no
 * `Intl.supportedValuesOf`), and the consent trail's two sentences.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	ACCOUNT_CALENDAR_VIEWS,
	ACCOUNT_NO_CONSENT_COPY,
	accountConsentDateFormat,
	accountConsentLabel,
	accountTimeZones
} from './account.calendar.rules';

describe('ACCOUNT_CALENDAR_VIEWS', () => {
	it('offers the five views in the approved order and wording', () => {
		expect(ACCOUNT_CALENDAR_VIEWS.map((view) => view.label)).toEqual([
			'Day View',
			'Week View',
			'Month View',
			'List View',
			'Dashboard (Day Dashboard)'
		]);
		expect(ACCOUNT_CALENDAR_VIEWS.map((view) => view.value)).toEqual([
			'dayView',
			'weekView',
			'monthView',
			'listView',
			'dashboard'
		]);
	});
});

describe('accountTimeZones', () => {
	it('falls back to UTC alone when the browser lacks supportedValuesOf', () => {
		const legacyIntl = {} as unknown as typeof Intl;
		expect(accountTimeZones(legacyIntl)).toEqual([{ value: 'UTC', label: 'UTC' }]);
	});

	it('shows underscores as spaces and sorts by the visible label', () => {
		const stub = {
			supportedValuesOf: () => ['Zulu/Zone', 'America/New_York', 'Alpha/Zone']
		} as unknown as typeof Intl;
		expect(accountTimeZones(stub)).toEqual([
			{ value: 'Alpha/Zone', label: 'Alpha/Zone' },
			{ value: 'America/New_York', label: 'America/New York' },
			{ value: 'Zulu/Zone', label: 'Zulu/Zone' }
		]);
	});
});

describe('accountConsentLabel', () => {
	const formatted = () => '12 March 2027';

	it('names each decision and dates it', () => {
		expect(accountConsentLabel('granted', '2027-03-12T10:00:00.000Z', formatted)).toBe(
			'Consented — 12 March 2027'
		);
		expect(accountConsentLabel('withdrawn', '2027-03-12T10:00:00.000Z', formatted)).toBe(
			'Consent withdrawn — 12 March 2027'
		);
	});

	it('reads an instant in en-GB long dates by default', () => {
		expect(accountConsentDateFormat(new Date('2027-03-12T12:00:00.000Z'))).toBe('12 March 2027');
	});

	it('keeps the approved empty-trail sentence', () => {
		expect(ACCOUNT_NO_CONSENT_COPY).toBe(
			'No ad consent recorded yet — the trail begins when the setting is first changed.'
		);
	});
});
