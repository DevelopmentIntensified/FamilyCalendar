/**
 * access device rules: how an Android sign-in names its `fp_` token and what a
 * mobile client may see of the person. Pure (R4/R5).
 *
 * Ported from legacy `mobileAuth.ts:105-131`: the name is
 * `Android — <deviceName>` with the device name trimmed, cut at 60 UTF-16
 * units and trimmed again (so a space on the cut disappears), defaulting to
 * `Android`; the placeholder email of an Anonymous Account never leaves the
 * server.
 *
 * Doc: ./README.md#invariants
 */
import type { MobileAuthUserResponse } from './access.contract';
import { maskGuestEmail } from './access.person.rules';

export const DEVICE_NAME_MAX = 60;

/** `Android — <deviceName>`, or `Android — Android` for a blank name. */
export function mobileTokenName(deviceName: string): string {
	const trimmed = deviceName.trim().slice(0, DEVICE_NAME_MAX).trim();
	return `Android — ${trimmed || 'Android'}`;
}

/** The person a mobile client may see: no hash, no placeholder email. */
export function toMobileUser(person: {
	readonly id: string;
	readonly firstName?: string | null;
	readonly lastName?: string | null;
	readonly email?: string | null;
}): MobileAuthUserResponse {
	return {
		id: person.id,
		firstName: person.firstName ?? null,
		lastName: person.lastName ?? null,
		email: maskGuestEmail(person)
	};
}
