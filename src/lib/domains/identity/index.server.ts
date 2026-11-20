/**
 * identity — public server interface: services and http handlers, and the two
 * cross-module ports identity declares (add-a-port.md#domain-ports).
 *
 * Identity is rank 1, so it cannot import the modules that own calendar
 * visibility (`calendar`) or the ad-consent trail (`sponsored`). It declares
 * what it needs here; those modules export the adapters (S5) and
 * `src/lib/app/ports.server.ts` attaches them to the ctx.
 *
 * Doc: ./README.md#public-interface
 */
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { ConsentRecordView } from './identity.contract';

/** Implemented by `calendar`: the calendars a person may pick as their default. */
export type CalendarAccessPort = {
	/** Their personal calendars plus the calendar of every family they belong to. */
	listAccessibleCalendarIds(userId: string): Promise<readonly string[]>;
};

/** Implemented by `sponsored`: the ad-consent evidence trail beside `showAdsAsEvents` (#088). */
export type AdConsentPort = {
	/** The person's consent records, newest first. */
	listConsentHistory(userId: string): Promise<readonly ConsentRecordView[]>;
	/**
	 * Appends one record when, and only when, the ad setting changed:
	 * `previous` is the stored value BEFORE the save (`undefined` with no row).
	 */
	recordConsentChange(
		userId: string,
		previous: boolean | null | undefined,
		next: boolean
	): Promise<void>;
};

/** The ports identity's settings service reads (`ctx.calendarAccess`, `ctx.adConsent`). */
export type IdentityPorts = {
	readonly calendarAccess: CalendarAccessPort;
	readonly adConsent: AdConsentPort;
};

/** The ctx the services that need a port take. */
export type IdentityCtx = Ctx & IdentityPorts;
