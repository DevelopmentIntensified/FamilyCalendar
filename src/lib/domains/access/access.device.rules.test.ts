/**
 * Pure device rules for access's Android sign-in: the `fp_` token name and the
 * public user shape. Both come from legacy `mobileAuth.ts:105-131`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { DEVICE_NAME_MAX, mobileTokenName, toMobileUser } from './access.device.rules';
import { GUEST_EMAIL_SUFFIX } from './access.person.rules';

describe('mobileTokenName', () => {
	it('caps the device name at 60 characters', () => {
		expect(DEVICE_NAME_MAX).toBe(60);
	});

	it.each<[string, string]>([
		['', 'Android — Android'],
		['   ', 'Android — Android'],
		['Pixel 9 Pro', 'Android — Pixel 9 Pro'],
		['  Pixel 9 Pro  ', 'Android — Pixel 9 Pro'],
		[`  ${'d'.repeat(80)}  `, `Android — ${'d'.repeat(60)}`],
		[`${'e'.repeat(60)}`, `Android — ${'e'.repeat(60)}`],
		[`${'f'.repeat(61)}`, `Android — ${'f'.repeat(60)}`],
		// Legacy trims, slices, then trims again: a space at the cut is dropped.
		[`${'g'.repeat(59)} h`, `Android — ${'g'.repeat(59)}`]
	])('names %j as %j', (deviceName, expected) => {
		expect(mobileTokenName(deviceName)).toBe(expected);
	});
});

describe('toMobileUser', () => {
	it('masks an Anonymous Account placeholder email to null', () => {
		expect(
			toMobileUser({
				id: 'guest-1',
				firstName: 'Guest',
				lastName: '',
				email: `guest-1${GUEST_EMAIL_SUFFIX}`
			})
		).toEqual({ id: 'guest-1', firstName: 'Guest', lastName: '', email: null });
	});

	it('hands a registered address through untouched', () => {
		expect(
			toMobileUser({ id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'a@b.com' })
		).toEqual({ id: 'u1', firstName: 'Ann', lastName: 'Lee', email: 'a@b.com' });
	});

	it('reads absent names as null and an absent email as null', () => {
		expect(toMobileUser({ id: 'u2' })).toEqual({
			id: 'u2',
			firstName: null,
			lastName: null,
			email: null
		});
	});
});
