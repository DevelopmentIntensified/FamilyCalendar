/**
 * The Calendar section's pure part: the option lists, the IANA zone list with
 * its approved fallback, and the consent-trail copy.
 *
 * Legacy `AccountCalendarSection.svelte:31-80` built all of this inside the
 * component. It is data, so it lives here: the zone list is the browser's own
 * (`Intl.supportedValuesOf('timeZone')` with underscores shown as spaces and
 * the whole list sorted by label), and UTC is the fallback when that API is
 * missing rather than no zones at all.
 *
 * Doc: ./README.md#invariants
 */
import type { AccountSectionModel } from './account.contract';

/** The settings view the section renders (one branch of the section union). */
export type AccountCalendarSectionModel = Extract<AccountSectionModel, { section: 'calendar' }>;

/** One `<option>` of the zone picker. */
export type AccountTimeZoneOption = { readonly value: string; readonly label: string };

/** The five views the approved page offers, in its order and wording. */
export const ACCOUNT_CALENDAR_VIEWS: readonly { readonly value: string; readonly label: string }[] = [
	{ value: 'dayView', label: 'Day View' },
	{ value: 'weekView', label: 'Week View' },
	{ value: 'monthView', label: 'Month View' },
	{ value: 'listView', label: 'List View' },
	{ value: 'dashboard', label: 'Dashboard (Day Dashboard)' }
];

/** The approved copy when the trail is empty. */
export const ACCOUNT_NO_CONSENT_COPY =
	'No ad consent recorded yet — the trail begins when the setting is first changed.';

/** The zone list, sorted by the label the reader sees. */
export function accountTimeZones(intl: typeof Intl = Intl): AccountTimeZoneOption[] {
	const zones = hasSupportedValuesOf(intl) ? intl.supportedValuesOf('timeZone') : ['UTC'];
	return zones
		.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }))
		.sort((left, right) => left.label.localeCompare(right.label));
}

/**
 * SAFETY: `Intl.supportedValuesOf` is a newer API — probing for it and falling
 * back to UTC keeps older browsers working.
 */
function hasSupportedValuesOf(
	value: typeof Intl
): value is typeof Intl & { supportedValuesOf: (key: 'timeZone') => string[] } {
	return typeof value.supportedValuesOf === 'function';
}

/** `Consented — 12 March 2027` / `Consent withdrawn — …`, in en-GB long dates. */
export function accountConsentLabel(
	decision: string,
	recordedAt: string,
	format: (date: Date) => string = accountConsentDateFormat
): string {
	const when = format(new Date(recordedAt));
	return decision === 'granted' ? `Consented — ${when}` : `Consent withdrawn — ${when}`;
}

/** The approved page's date format; exported so tests can pin it. */
export function accountConsentDateFormat(date: Date): string {
	return new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(date);
}
