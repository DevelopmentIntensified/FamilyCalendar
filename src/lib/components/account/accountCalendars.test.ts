import { describe, it, expect } from 'vitest';
import { familyCalendarEntries } from './accountCalendars';

const memberships = [
	{ family: { id: 'f1', name: 'Rivera' } },
	{ family: { id: 'f2', name: 'Grandparents' } }
];

describe('familyCalendarEntries (#251)', () => {
	it('lists the calendar of EVERY family, named after its own family', () => {
		const cals = [
			{ id: 'c1', familyId: 'f1' },
			{ id: 'c2', familyId: 'f2' }
		];
		expect(familyCalendarEntries(memberships, cals)).toEqual([
			{ id: 'c1', name: 'Rivera' },
			{ id: 'c2', name: 'Grandparents' }
		]);
	});

	it('falls back to "Family Calendar" for an unnamed family', () => {
		expect(
			familyCalendarEntries([{ family: { id: 'f1', name: '' } }], [{ id: 'c1', familyId: 'f1' }])
		).toEqual([{ id: 'c1', name: 'Family Calendar' }]);
	});

	it('drops calendars of families the user is not in', () => {
		expect(familyCalendarEntries(memberships, [{ id: 'cx', familyId: 'f9' }])).toEqual([]);
	});

	it('no memberships -> nothing', () => {
		expect(familyCalendarEntries([], [{ id: 'c1', familyId: 'f1' }])).toEqual([]);
	});
});
