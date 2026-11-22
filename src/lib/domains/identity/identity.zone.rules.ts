/**
 * identity zone rules: the stored-zone resolution — the one identity rule that
 * needs Luxon.
 *
 * It sits apart from `identity.person.rules.ts` because the browser components
 * that only ask `isRegisteredAccount`/`isAnonymousAccount` (the shell's profile
 * menu, the marketing header, the frames) pulled Luxon into the app chrome
 * with it (ADR 0010: the chrome is on every page). Server reads are the only
 * callers.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';

/**
 * The stored zone when Luxon can resolve it, else `undefined` (= server-local,
 * a transitional fallback). Feeds every cursor pin (#214).
 *
 * Deliberately permissive, unlike `isIanaTimeZone` (Q-107): rows written
 * before that fix may hold `local`, `system`, `default` or `UTC+5`, and every
 * reader must resolve them exactly as before rather than dropping the zone.
 */
export function zoneFromStored(timeZone: string | null | undefined): string | undefined {
	if (!timeZone) return undefined;
	return DateTime.fromMillis(0).setZone(timeZone).isValid ? timeZone : undefined;
}
