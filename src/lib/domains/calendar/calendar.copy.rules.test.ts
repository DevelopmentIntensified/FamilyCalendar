/**
 * The vocabularies and copy moved out of the contract so the browser can read
 * them without zod: the contract and the public entry must still hand out the
 * very same values, and the closed lists keep their wire order.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import * as contract from './calendar.contract';
import * as copy from './calendar.copy.rules';
import * as entry from './index';

describe('calendar copy rules', () => {
	it('keeps the closed vocabularies in wire order', () => {
		expect(copy.RSVP_STATUSES).toEqual(['going', 'maybe', 'declined', 'undecided']);
		expect(copy.CALENDAR_KINDS).toEqual(['personal', 'family']);
		expect(copy.BULK_OP_TYPES).toEqual(['delete', 'calendar', 'location', 'attendants', 'smart']);
		expect(copy.WEEKDAY_CODES).toEqual(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
	});

	it.each(['RSVP_STATUSES', 'CALENDAR_KINDS', 'BULK_OP_TYPES', 'WEEKDAY_CODES', 'CALENDAR_COPY'] as const)(
		'hands out the same %s from the contract and the public entry',
		(name) => {
			expect(contract[name]).toBe(copy[name]);
			expect(entry[name]).toBe(copy[name]);
		}
	);
});
