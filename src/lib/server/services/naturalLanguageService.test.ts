import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { parseEventInput, type ParseResult } from './naturalLanguageService';

describe('NLP Event Parser', () => {
	describe('Date Patterns', () => {
		it('parses "this Friday"', () => {
			const result = parseEventInput('meeting this Friday');
			expect(result.parsed.date).toBeDefined();
			expect(result.confidence).toBeGreaterThan(0.2);
		});

		it('parses "next Tuesday"', () => {
			const result = parseEventInput('meeting next Tuesday');
			expect(result.parsed.date).toBeDefined();
		});

		it('parses "tomorrow"', () => {
			const result = parseEventInput('meeting tomorrow');
			expect(result.parsed.date).toBeDefined();
		});

		it('parses "July 12th"', () => {
			const result = parseEventInput('party on July 12th');
			expect(result.parsed.date).toContain('07-12');
		});

		it('parses "May 4th"', () => {
			const result = parseEventInput('festival May 4th');
			expect(result.parsed.date).toContain('05-04');
		});

		it('parses "next May"', () => {
			const result = parseEventInput('event next May');
			expect(result.parsed.date).toBeDefined();
		});

		it('parses "3rd of may"', () => {
			const result = parseEventInput('test event on the 3rd of may at 5pm');
			expect(result.parsed.date).toContain('05-03');
			expect(result.parsed.startTime).toBe('17:00');
		});

		it('parses "third of may" (word ordinal)', () => {
			const result = parseEventInput('event third of June');
			expect(result.parsed.date).toContain('06-03');
		});

		it('parses "1st of January"', () => {
			const result = parseEventInput('party 1st of January');
			expect(result.parsed.date).toContain('01-01');
		});

		it('parses "2nd of February"', () => {
			const result = parseEventInput('meeting 2nd of February');
			expect(result.parsed.date).toContain('02-02');
		});

		it('parses "twenty-first of December"', () => {
			const result = parseEventInput('gala on the twenty-first of December');
			expect(result.parsed.date).toContain('12-21');
		});

		it('parses "fourteenth of March"', () => {
			const result = parseEventInput('event fourteenth of March');
			expect(result.parsed.date).toContain('03-14');
		});
	});

	describe('Time Patterns', () => {
		it('parses "starting at 6 PM"', () => {
			const result = parseEventInput('meeting starting at 6 PM');
			expect(result.parsed.startTime).toBe('18:00');
		});

		it('parses "at 8 AM"', () => {
			const result = parseEventInput('meet at 8 AM');
			expect(result.parsed.startTime).toBe('08:00');
		});

		it('parses "from 9 AM to 5 PM"', () => {
			const result = parseEventInput('workshop from 9 AM to 5 PM');
			expect(result.parsed.startTime).toBe('09:00');
			expect(result.parsed.endTime).toBe('17:00');
		});

		it('parses "for 2 hours"', () => {
			const result = parseEventInput('hangout starting at 7 PM for 2 hours');
			expect(result.parsed.startTime).toBe('19:00');
			expect(result.parsed.endTime).toBe('21:00');
		});

		it('parses "kicking off at 5 PM"', () => {
			const result = parseEventInput('party kicking off at 5 PM');
			expect(result.parsed.startTime).toBe('17:00');
		});

		it('parses "wrapping up around 9 PM"', () => {
			const result = parseEventInput('event wrapping up around 9 PM');
			expect(result.parsed.endTime).toBe('21:00');
		});

		it('parses "closing at 6 PM"', () => {
			const result = parseEventInput('sale closing at 6 PM');
			expect(result.parsed.endTime).toBe('18:00');
		});

		it('parses "leaving at 6 AM"', () => {
			const result = parseEventInput('trip leaving at 6 AM');
			expect(result.parsed.startTime).toBe('06:00');
		});

		it('parses "arriving at 10 AM"', () => {
			const result = parseEventInput('beach day arriving at 10 AM');
			expect(result.parsed.startTime).toBe('10:00');
		});
	});

	describe('Location Patterns', () => {
		it('parses "at the downtown roastery"', () => {
			const result = parseEventInput('coffee at the downtown roastery');
			expect(result.parsed.location).toBeDefined();
		});

		it('parses "at my apartment"', () => {
			const result = parseEventInput('game night at my apartment');
			expect(result.parsed.location).toBe('Apartment');
		});

		it('parses "at home"', () => {
			const result = parseEventInput('movie night at home');
			expect(result.parsed.location).toBe('Home');
		});

		it('parses "at 450 Main Street"', () => {
			const result = parseEventInput('sale at 450 Main Street');
			expect(result.parsed.location).toBe('450 Main Street');
		});

		it('parses "at Central Park"', () => {
			const result = parseEventInput('picnic at Central Park');
			expect(result.parsed.location).toBe('Central Park');
		});
	});

	describe('All-Day Events', () => {
		it('parses "all day" as allDay', () => {
			const result = parseEventInput('birthday all day');
			expect(result.parsed.allDay).toBe(true);
		});

		it('parses "whole day" as allDay', () => {
			const result = parseEventInput('celebration whole day');
			expect(result.parsed.allDay).toBe(true);
		});
	});

	describe('Attendant Patterns', () => {
		it('parses "with John"', () => {
			const result = parseEventInput('coffee with John');
			expect(result.parsed.attendants).toContain('John');
		});

		it('parses "with Sarah and Mike"', () => {
			const result = parseEventInput('dinner with Sarah and Mike');
			expect(result.parsed.attendants).toContain('Sarah');
		});

		it('parses "Alex and I"', () => {
			const result = parseEventInput('Alex and I are grabbing coffee tomorrow');
			expect(result.parsed.attendants).toBeDefined();
		});

		it('parses "My sister and I"', () => {
			const result = parseEventInput('My sister and I are planning a trip');
			expect(result.parsed.attendants).toBeDefined();
		});

		it('parses "The team and I"', () => {
			const result = parseEventInput('The team and I are hosting a launch');
			expect(result.parsed.attendants).toBeDefined();
		});

		it('parses "You and I and the rest"', () => {
			const result = parseEventInput('You and I and the rest of the committee');
			expect(result.parsed.attendants).toBeDefined();
		});
	});

	describe('Title Extraction', () => {
		it('extracts meaningful title', () => {
			const result = parseEventInput('coffee with John tomorrow at 8 AM');
			expect(result.parsed.title).toBeDefined();
			expect(result.parsed.title?.length).toBeGreaterThan(3);
		});

		it('handles empty-ish input', () => {
			const result = parseEventInput('tomorrow');
			expect(result.parsed.title).toBeDefined();
		});
	});

	describe('Complex Real-World Examples', () => {
		it('parses board game night', () => {
			const result = parseEventInput(
				"I'm going to host a board game night this Friday, starting at 7 PM and running until midnight at my apartment on 42 Maple Drive. I expect a crowd of close friends and neighbors who love strategy games and pizza."
			);
			expect(result.parsed.title).toContain('board game night');
			expect(result.parsed.startTime).toBe('19:00');
			expect(result.parsed.endTime).toBe('00:00'); // midnight
			expect(result.parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Friday date
			expect(result.parsed.location).toBe('42 Maple Drive');
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it('parses hiking trip', () => {
			const result = parseEventInput(
				"We are doing a team building hiking trip early tomorrow morning, leaving at 6 AM and returning by 2 PM from the Blue Ridge Trailhead."
			);
			expect(result.parsed.startTime).toBe('06:00');
			expect(result.parsed.endTime).toBe('14:00'); // returning by 2 PM
			expect(result.parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // tomorrow
			expect(result.parsed.location).toBe('Blue Ridge Trailhead');
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it('parses birthday dinner', () => {
			const result = parseEventInput(
				"I plan to organize a surprise birthday dinner for Sarah, kicking off at 6 PM on Saturday at The Olive Garden and wrapping up around 9 PM."
			);
			expect(result.parsed.startTime).toBe('18:00');
			expect(result.parsed.endTime).toBe('21:00');
			expect(result.parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Saturday
			expect(result.parsed.location).toBe('The Olive Garden');
			// Title is first 50 chars: "I plan to organize a surprise birthday dinner for "
			expect(result.parsed.title).toBe('I plan to organize a surprise birthday dinner for ');
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it('parses charity run', () => {
			const result = parseEventInput(
				"I'm putting on a 5k charity run next month, with the race beginning at 8 AM on May 15th and finishing around 11 AM at City Park."
			);
			expect(result.parsed.startTime).toBe('08:00');
			expect(result.parsed.endTime).toBe('11:00'); // finishing around 11 AM
			expect(result.parsed.date).toMatch(/^\d{4}-05-15$/); // May 15th
			expect(result.parsed.location).toBe('City Park');
			expect(result.parsed.title).toContain('charity run');
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it('parses workshop', () => {
			const result = parseEventInput(
				"We are hosting a workshop on financial literacy, scheduled from 10 AM to 1 PM next Wednesday at the Community Center."
			);
			expect(result.parsed.startTime).toBe('10:00');
			expect(result.parsed.endTime).toBe('13:00');
			expect(result.parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // next Wednesday
			expect(result.parsed.location).toBe('Community Center');
			expect(result.parsed.title).toContain('workshop');
			expect(result.parsed.title).toContain('financial literacy');
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it('parses potluck', () => {
			const result = parseEventInput(
				"We are cooking a community potluck dinner this Sunday, starting at 5 PM and continuing until 9 PM at the neighborhood clubhouse."
			);
			expect(result.parsed.startTime).toBe('17:00');
			expect(result.parsed.endTime).toBe('21:00');
			expect(result.parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Sunday
			expect(result.parsed.location).toBe('neighborhood clubhouse');
			expect(result.parsed.title).toContain('potluck');
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it('calculates endTime from startTime + duration', () => {
			const result = parseEventInput(
				"flash mob starting at noon and lasting for about 15 minutes."
			);
			expect(result.parsed.startTime).toBe('12:00');
			expect(result.parsed.endTime).toBe('12:15'); // noon + 15 min
		});

		it('parses "about 15 min" duration', () => {
			const result = parseEventInput('flash mob starting at noon and about 15 min');
			expect(result.parsed.startTime).toBe('12:00');
			expect(result.parsed.endTime).toBe('12:15');
		});

		it('parses "for about 15 min" duration', () => {
			const result = parseEventInput('meeting at 3pm for about 15 min');
			expect(result.parsed.startTime).toBe('15:00');
			expect(result.parsed.endTime).toBe('15:15');
		});

		it('parses "for about 2 hr" duration', () => {
			const result = parseEventInput('workshop at 1pm for about 2 hr');
			expect(result.parsed.startTime).toBe('13:00');
			expect(result.parsed.endTime).toBe('15:00');
		});

		it('parses "lasting about 20 min" duration', () => {
			const result = parseEventInput('presentation at 10am lasting about 20 min');
			expect(result.parsed.startTime).toBe('10:00');
			expect(result.parsed.endTime).toBe('10:20');
		});

		it('parses "for 30 mins" duration', () => {
			const result = parseEventInput('call at 2pm for 30 mins');
			expect(result.parsed.startTime).toBe('14:00');
			expect(result.parsed.endTime).toBe('14:30');
		});

		it('parses production call time with AM/PM shorthand', () => {
			const result = parseEventInput(
				'Production (Camera Controller) Call Time, BAND, SOUND, & PRODUCTION: 05/03 at 7:15A'
			);
			expect(result.parsed.date).toMatch(/^\d{4}-05-03$/); // May 3rd this year
			expect(result.parsed.startTime).toBe('07:15'); // 7:15 AM not PM
			expect(result.parsed.title).toContain('Production');
			expect(result.confidence).toBeGreaterThan(0.3);
		});

		it('parses meditation session', () => {
			const result = parseEventInput(
				"I'm leading a meditation session for stress relief, beginning at 6 AM tomorrow at the yoga studio and finishing at 7 AM."
			);
			expect(result.parsed.startTime).toBe('06:00');
			expect(result.parsed.endTime).toBe('07:00');
			expect(result.parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // tomorrow
			expect(result.parsed.location).toBe('yoga studio');
			expect(result.parsed.title).toContain('meditation');
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it('parses beach day with sunset', () => {
			const result = parseEventInput(
				"Us three friends are hitting the beach this Saturday, arriving at 10 AM and staying until sunset."
			);
			expect(result.parsed.startTime).toBe('10:00');
			expect(result.parsed.endTime).toBe('20:00');
			expect(result.parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Saturday
			expect(result.parsed.title).toContain('beach');
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it('parses game night late', () => {
			const result = parseEventInput(
				"You and I and the rest of the group are hosting a game night this Friday, starting at 7 PM and running late into the evening."
			);
			expect(result.parsed.startTime).toBe('19:00');
			expect(result.parsed.endTime).toBe('23:00');
			expect(result.parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Friday
			// Title is first 50 chars: "You and I and the rest of the group are hosting a "
			expect(result.parsed.title).toBe('You and I and the rest of the group are hosting a ');
			expect(result.confidence).toBeGreaterThan(0.5);
		});
	});

	describe('Location Keyword Parsing', () => {
		it('parses "Location: LU" as location, not attendant', () => {
			const result = parseEventInput(
				'Finals! And Goodbye for the Summer!\nDate: Thu, May 7, 2026\nTime: 5:00 PM - 3:59 PM\nLocation: LU\nType: Social'
			);
			expect(result.parsed.location).toBe('LU');
			expect(result.parsed.attendants).toBeUndefined();
		});

		it('parses "location at the park" as location', () => {
			const result = parseEventInput('meeting location at the park');
			expect(result.parsed.location).toBe('the park');
		});

		it('parses "Location: Room 201" as location', () => {
			const result = parseEventInput('Conference\nLocation: Room 201\nTime: 2 PM');
			expect(result.parsed.location).toBe('Room 201');
		});

		it('does not treat short uppercase tokens after location as attendants', () => {
			const result = parseEventInput('Party at LU with friends');
			expect(result.parsed.location).toBeDefined();
			expect(result.parsed.attendants).toBeUndefined();
		});
	});

	describe('Creative Edge Cases', () => {
		it('handles "sharp" time', () => {
			const result = parseEventInput('meeting at 8 AM sharp');
			expect(result.parsed.startTime).toBe('08:00');
		});

		it('handles "noon"', () => {
			const result = parseEventInput('lunch at noon');
			expect(result.parsed.startTime).toBe('12:00');
		});

		it('handles "midnight"', () => {
			const result = parseEventInput('party until midnight');
			expect(result.parsed.endTime).toBe('00:00');
		});

		it('handles "dusk"', () => {
			const result = parseEventInput('event beginning at dusk');
			expect(result.parsed.startTime).toBeDefined();
		});

		it('handles "early morning"', () => {
			const result = parseEventInput('hike early morning');
			expect(result.parsed.startTime).toBeDefined();
		});

		it('handles "afternoon"', () => {
			const result = parseEventInput('meeting this afternoon');
			expect(result.parsed.startTime).toBeDefined();
		});

		it('handles "evening"', () => {
			const result = parseEventInput('dinner this evening');
			expect(result.parsed.startTime).toBeDefined();
		});

		it('handles date with ordinal "1st", "2nd", "3rd"', () => {
			const result = parseEventInput('event on July 1st');
			expect(result.parsed.date).toContain('07-01');
		});

		it('handles month-only next reference', () => {
			const result = parseEventInput('conference next October');
			expect(result.parsed.date).toBeDefined();
		});

		it('handles "returning evening"', () => {
			const result = parseEventInput('trip returning Sunday evening');
			expect(result.parsed.endTime).toBe('18:00');
		});

		it('handles hyphenated time range "6:00PM - 8:00PM"', () => {
			const result = parseEventInput('Clients & Friends Appreciation Night 6:00PM - 8:00PM');
			expect(result.parsed.startTime).toBe('18:00');
			expect(result.parsed.endTime).toBe('20:00');
		});

		it('handles hyphenated time range with spaces', () => {
			const result = parseEventInput('event 7:30 AM - 9:00 PM');
			expect(result.parsed.startTime).toBe('07:30');
			expect(result.parsed.endTime).toBe('21:00');
		});

		it('handles @ symbol for location (title truncation)', () => {
			const result = parseEventInput('Clients & Friends Appreciation Night @ Mr. Goodies Thursday, April 30, 2026 6:00PM - 8:00PM');
			// Title is first 50 chars: "Clients & Friends Appreciation Night @ Mr. Goodies"
			expect(result.parsed.title).toBe('Clients & Friends Appreciation Night @ Mr. Goodies');
			expect(result.parsed.location).toBe('Mr. Goodies');
			expect(result.parsed.startTime).toBe('18:00');
			expect(result.parsed.endTime).toBe('20:00');
		});
	});

	describe('Relative Date Offsets', () => {
		it('parses "in 3 days"', () => {
			const result = parseEventInput('checkup in 3 days');
			const expected = DateTime.now().plus({ days: 3 }).toFormat('MM-dd');
			expect(result.parsed.date).toContain(expected);
		});

		it('parses "in 2 weeks"', () => {
			const result = parseEventInput('review in 2 weeks');
			const expected = DateTime.now().plus({ weeks: 2 }).toFormat('MM-dd');
			expect(result.parsed.date).toContain(expected);
		});

		it('parses "in a month"', () => {
			const result = parseEventInput('follow up in a month');
			const expected = DateTime.now().plus({ months: 1 }).toFormat('MM-dd');
			expect(result.parsed.date).toContain(expected);
		});

		it('parses "this weekend" as the upcoming Saturday', () => {
			const result = parseEventInput('camping this weekend');
			const daysUntilSat = (6 - DateTime.now().weekday % 7 + 7) % 7 || 7;
			const expected = DateTime.now().plus({ days: daysUntilSat }).toFormat('MM-dd');
			expect(result.parsed.date).toContain(expected);
		});
	});

	describe('Additional Date Formats', () => {
		it('parses month abbreviation "Aug 30"', () => {
			const result = parseEventInput('barbecue Aug 30');
			expect(result.parsed.date).toContain('08-30');
		});

		it('parses four-letter abbreviation "Sept 5"', () => {
			const result = parseEventInput('picnic Sept 5');
			expect(result.parsed.date).toContain('09-05');
		});

		it('parses day-first with year "21 Mar 2027"', () => {
			const result = parseEventInput('launch 21 Mar 2027');
			expect(result.parsed.date).toContain('2027-03-21');
		});

		it('parses ISO date "2026-08-30"', () => {
			const result = parseEventInput('deadline 2026-08-30');
			expect(result.parsed.date).toContain('2026-08-30');
		});

		it('parses year suffix "July 12th 2027"', () => {
			const result = parseEventInput('reunion July 12th 2027');
			expect(result.parsed.date).toContain('2027-07-12');
		});

		it('parses comma style "Dec 25, 2026"', () => {
			const result = parseEventInput('dinner Dec 25, 2026');
			expect(result.parsed.date).toContain('2026-12-25');
		});
	});

	describe('Colloquial & Military Times', () => {
		it('parses "half past seven pm"', () => {
			const result = parseEventInput('movie half past seven pm');
			expect(result.parsed.startTime).toBe('19:30');
		});

		it('parses "quarter to nine am"', () => {
			const result = parseEventInput('standup quarter to nine am');
			expect(result.parsed.startTime).toBe('08:45');
		});

		it('parses "quarter past two pm"', () => {
			const result = parseEventInput('tea quarter past two pm');
			expect(result.parsed.startTime).toBe('14:15');
		});

		it('parses military time "1830"', () => {
			const result = parseEventInput('call grandma at 1830');
			expect(result.parsed.startTime).toBe('18:30');
		});

		it('parses dash range "from 2-4pm"', () => {
			const result = parseEventInput('workshop from 2-4pm');
			expect(result.parsed.startTime).toBe('14:00');
			expect(result.parsed.endTime).toBe('16:00');
		});

		it('parses "between 2 and 4 PM"', () => {
			const result = parseEventInput('window between 2 and 4 PM');
			expect(result.parsed.startTime).toBe('14:00');
			expect(result.parsed.endTime).toBe('16:00');
		});
	});

	describe('Recurrence Detection', () => {
		it('parses "every Tuesday" as weekly', () => {
			const result = parseEventInput('soccer practice every Tuesday at 4pm');
			expect(result.parsed.recurring).toBe('weekly');
		});

		it('parses "daily" as daily', () => {
			const result = parseEventInput('standup daily at 9am');
			expect(result.parsed.recurring).toBe('daily');
		});

		it('parses "every day" as daily', () => {
			const result = parseEventInput('water the plants every day');
			expect(result.parsed.recurring).toBe('daily');
		});

		it('parses "weekly on Mondays"', () => {
			const result = parseEventInput('trash pickup weekly on Mondays');
			expect(result.parsed.recurring).toBe('weekly');
		});

		it('parses "every other week" as biweekly', () => {
			const result = parseEventInput('payday every other week');
			expect(result.parsed.recurring).toBe('biweekly');
		});

		it('parses "monthly on the 15th" as monthly', () => {
			const result = parseEventInput('rent due monthly on the 15th');
			expect(result.parsed.recurring).toBe('monthly');
		});

		it('parses "annually" as yearly', () => {
			const result = parseEventInput('insurance renewal annually');
			expect(result.parsed.recurring).toBe('yearly');
		});

		it('parses "every 3 days" as interval form', () => {
			const result = parseEventInput('medication every 3 days');
			expect(result.parsed.recurring).toBe('every_3_days');
		});

		it('does not leak the recurrence phrase into the title', () => {
			const result = parseEventInput('soccer practice every Tuesday at 4pm');
			expect(result.parsed.title?.toLowerCase()).not.toContain('every tuesday');
		});
	});
});
describe('Timezone-aware parsing', () => {
	it('resolves "tomorrow" in a zone ahead of UTC', () => {
		// 2026-08-24T00:30Z is still Aug 23 in New York but Aug 24 in Auckland.
		const utcTomorrow = parseEventInput('meeting tomorrow', 'UTC').parsed.date;
		const auckland = parseEventInput('meeting tomorrow', 'Pacific/Auckland').parsed.date;
		const ny = parseEventInput('meeting tomorrow', 'America/New_York').parsed.date;
		// All three must be defined; Auckland must never trail New York.
		expect(auckland).toBeDefined();
		expect(ny).toBeDefined();
		expect(utcTomorrow).toBeDefined();
		expect(auckland! >= ny!).toBe(true);
	});

		it('resolves "this friday" against the zone-provided today', () => {
		// "this <weekday>" = the upcoming weekday strictly after now, in the zone.
		// (Absolute-date fixtures decay as real time rolls on; assert against the zone clock.)
		const nyNow = DateTime.now().setZone('America/New_York');
		let daysUntilFriday = (5 - (nyNow.weekday % 7) + 7) % 7;
		if (daysUntilFriday === 0) daysUntilFriday = 7; // today is Friday -> next week
		const expected = nyNow.plus({ days: daysUntilFriday }).toISODate();
		const nyResult = parseEventInput('meet this friday', 'America/New_York').parsed.date;
		expect(nyResult).toBe(expected);
	});

	it('defaults to server-local when no zone given', () => {
		const result = parseEventInput('meeting tomorrow');
		expect(result.parsed.date).toBe(DateTime.now().plus({ days: 1 }).toISODate());
	});
});

describe('Weekday parsing respects zone', () => {
	it('resolves "this Friday" against the provided zone', () => {
		const zone = 'Pacific/Auckland';
		const now = DateTime.now().setZone(zone);
		const daysUntilFriday = (5 - (now.weekday % 7) + 7) % 7 || 7;
		const result = parseEventInput('meeting this Friday', zone);
		expect(result.parsed.date).toBe(now.plus({ days: daysUntilFriday }).toISODate());
	});

	it('resolves "next Wednesday" against the provided zone', () => {
		const zone = 'America/New_York';
		const now = DateTime.now().setZone(zone);
		const daysUntilNextWed = ((3 - (now.weekday % 7) + 7) % 7 || 7) + 7;
		const result = parseEventInput('workshop next Wednesday', zone);
		expect(result.parsed.date).toBe(now.plus({ days: daysUntilNextWed }).toISODate());
	});

	it('resolves "returning Saturday" against the provided zone', () => {
		const zone = 'UTC';
		const now = DateTime.now().setZone(zone);
		const daysUntilSaturday = (6 - (now.weekday % 7) + 7) % 7 || 7;
		const result = parseEventInput('trip returning Saturday', zone);
		expect(result.parsed.date).toBe(now.plus({ days: daysUntilSaturday }).toISODate());
	});
});

describe('Plural weekday recurrence ("on wednesdays")', () => {
	const cases: Array<[string, number]> = [
		['launch on wednesdays', 3],
		['yoga on tuesdays at 6pm', 2],
		['team sync on mondays', 1],
		['fridays demo at noon', 5],
		['SATURDAYS cleanup', 6],
		['meet on sundays', 0],
		['dinner on thursdays', 4]
	];
	for (const [input, weekday] of cases) {
		it(`parses "${input}" as weekly on the next matching weekday`, () => {
			const now = DateTime.now();
			const daysUntil = (weekday - (now.weekday % 7) + 7) % 7 || 7;
			const result = parseEventInput(input);
			expect(result.parsed.recurring).toBe('weekly');
			expect(result.parsed.date).toBe(now.plus({ days: daysUntil }).toISODate());
		});
	}

	it('lets an explicit date win over the plural weekday', () => {
		const result = parseEventInput('party on saturdays sept 12');
		expect(result.parsed.recurring).toBe('weekly');
		expect(result.parsed.date).toContain('09-12');
	});

	it('strips the plural weekday from the title', () => {
		const result = parseEventInput('launch on wednesdays at 5pm');
		expect(result.parsed.title?.toLowerCase()).not.toContain('wednesdays');
	});

	it('parses the reported "launch on wednesdays, sept 23 & 30 from 5:30-6:30pm"', () => {
		const result = parseEventInput('launch on wednesdays, sept 23 & 30 from 5:30-6:30pm');
		expect(result.parsed.recurring).toBe('weekly');
		expect(result.parsed.date).toContain('09-23');
		expect(result.parsed.startTime).toBe('17:30');
		expect(result.parsed.endTime).toBe('18:30');
	});
});

describe('Hyphen range meridiem propagation ("5:30-6:30pm")', () => {
	const cases: Array<[string, string, string]> = [
		['meeting 5:30-6:30pm', '17:30', '18:30'],
		['call 9:00-10:00am', '09:00', '10:00'],
		['lunch 12:00-1:00pm', '12:00', '13:00'],
		['standup 8:15-8:30am', '08:15', '08:30'],
		['event 6:00PM - 8:00PM', '18:00', '20:00'],
		['event 7:30 AM - 9:00 PM', '07:30', '21:00']
	];
	for (const [input, start, end] of cases) {
		it(`parses "${input}" as ${start}–${end}`, () => {
			const result = parseEventInput(input);
			expect(result.parsed.startTime).toBe(start);
			expect(result.parsed.endTime).toBe(end);
		});
	}
});

describe('Glued article times ("a5pm")', () => {
	const cases: Array<[string, string]> = [
		['a5pm disc golf', '17:00'],
		['a830am standup', '08:30'],
		['dinner a 9pm', '21:00'],
		['lunch a 12pm', '12:00'],
		['a6am run', '06:00'],
		['movie a 11pm', '23:00']
	];
	for (const [input, start] of cases) {
		it(`parses "${input}" as starting ${start}`, () => {
			const result = parseEventInput(input);
			expect(result.parsed.startTime).toBe(start);
		});
	}

	it('ignores article-number without a meridiem ("a 5 minute break")', () => {
		const result = parseEventInput('take a 5 minute break saturday');
		expect(result.parsed.startTime).toBeUndefined();
	});

	it('ignores article-number distance ("a 5k run saturday")', () => {
		const result = parseEventInput('join us for a 5k run saturday');
		expect(result.parsed.startTime).toBeUndefined();
	});

	it('parses the reported "a5pm disc golf at independence park…"', () => {
		const result = parseEventInput('a5pm disc golf at independence park. with jay and the league');
		expect(result.parsed.startTime).toBe('17:00');
		expect(result.parsed.location).toBe('independence park');
		expect(result.parsed.date).toBeDefined();
	});
});

describe('Recurrence end (count)', () => {
	const cases: Array<[string, string, number]> = [
		['yoga every Tuesday for 6 weeks', 'weekly', 6],
		['standup daily for 10 days', 'daily', 10],
		['payday every other week for 3 months', 'biweekly', 3],
		['medication every 3 days 5 times', 'every_3_days', 5],
		['book club monthly 4 times', 'monthly', 4],
		['rent due monthly for 12 months', 'monthly', 12],
		['soccer weekly for 8 sessions', 'weekly', 8]
	];
	for (const [input, recurring, count] of cases) {
		it(`parses "${input}" as ${recurring} × ${count}`, () => {
			const result = parseEventInput(input);
			expect(result.parsed.recurring).toBe(recurring);
			expect(result.parsed.recurringCount).toBe(count);
		});
	}

	it('ignores counts without a recurrence ("party in 2 weeks", "buy milk 2 times")', () => {
		expect(parseEventInput('party in 2 weeks').parsed.recurringCount).toBeUndefined();
		expect(parseEventInput('buy milk 2 times').parsed.recurringCount).toBeUndefined();
	});
});

describe('Recurrence end (until)', () => {
	it('parses "yoga every Monday until Dec 15" without stealing the date', () => {
		const result = parseEventInput('yoga every Monday until Dec 15');
		expect(result.parsed.recurring).toBe('weekly');
		expect(result.parsed.recurringUntil).toContain('12-15');
		// The until-date is the end of the series, not the event date.
		expect(result.parsed.date).not.toBe(result.parsed.recurringUntil);
	});

	const cases: Array<[string, string]> = [
		['soccer practice weekly until sept 30', '09-30'],
		['standup daily until 2026-10-01', '10-01'],
		['choir every Thursday until December 20, 2026', '12-20']
	];
	for (const [input, fragment] of cases) {
		it(`parses "${input}" with until ${fragment}`, () => {
			const result = parseEventInput(input);
			expect(result.parsed.recurring).toBeDefined();
			expect(result.parsed.recurringUntil).toContain(fragment);
			expect(result.parsed.date).not.toBe(result.parsed.recurringUntil);
		});
	}

	it('ignores until without a recurrence ("submit report until Friday")', () => {
		expect(parseEventInput('submit report until Friday').parsed.recurringUntil).toBeUndefined();
	});
});

describe('Multi-day weekly ("every Mon, Wed, Fri")', () => {
	const cases: Array<[string, string[]]> = [
		['standup every Mon, Wed, Fri at 9am', ['MO', 'WE', 'FR']],
		['gym every Monday, Wednesday and Friday', ['MO', 'WE', 'FR']],
		['team sync weekly on Mon & Wed', ['MO', 'WE']],
		['class every tue and thur at 6pm', ['TU', 'TH']],
		['trash weekdays at 7am', ['MO', 'TU', 'WE', 'TH', 'FR']],
		['party weekends', ['SA', 'SU']]
	];
	for (const [input, byDay] of cases) {
		it(`parses "${input}" as weekly on ${byDay.join('/')}`, () => {
			const result = parseEventInput(input);
			expect(result.parsed.recurring).toBe('weekly');
			expect(result.parsed.recurringByDay).toEqual(byDay);
		});
	}

	it('anchors the date on the nearest listed weekday', () => {
		const result = parseEventInput('gym every Mon, Wed, Fri');
		const weekday = DateTime.fromISO(result.parsed.date!).weekday; // 1=Mon..7=Sun
		expect([1, 3, 5]).toContain(weekday);
	});

	it('treats "twice a week" as weekly without inventing days', () => {
		const result = parseEventInput('meet twice a week');
		expect(result.parsed.recurring).toBe('weekly');
		expect(result.parsed.recurringByDay).toBeUndefined();
	});

	it('leaves single or dateless weekday pairs alone ("lunch Monday", "meeting Monday and Tuesday")', () => {
		expect(parseEventInput('lunch Monday').parsed.recurringByDay).toBeUndefined();
		expect(parseEventInput('meeting Monday and Tuesday').parsed.recurringByDay).toBeUndefined();
	});

	it('does not mistake the until-weekday for a series day ("yoga every Monday until Friday")', () => {
		const result = parseEventInput('yoga every Monday until Friday');
		expect(result.parsed.recurring).toBe('weekly');
		expect(result.parsed.recurringByDay ?? ['MO']).toEqual(['MO']);
	});
});

describe('Ordinal weekday ("first Friday of October")', () => {
	it('parses "party first Friday of October" as an October Friday in the future', () => {
		const result = parseEventInput('party first Friday of October');
		const dt = DateTime.fromISO(result.parsed.date!);
		expect(dt.month).toBe(10);
		expect(dt.weekday).toBe(5);
		expect(dt >= DateTime.now().startOf('day')).toBe(true);
	});

	it('parses "meeting third Thursday of November"', () => {
		const result = parseEventInput('meeting third Thursday of November');
		const dt = DateTime.fromISO(result.parsed.date!);
		expect(dt.month).toBe(11);
		expect(dt.weekday).toBe(4);
		// Must actually be the 3rd Thursday, not just any Thursday.
		expect(Math.ceil(dt.day / 7)).toBe(3);
	});

	it('parses "deadline last Friday of the month" as a late-month Friday', () => {
		const result = parseEventInput('deadline last Friday of the month');
		const dt = DateTime.fromISO(result.parsed.date!);
		expect(dt.weekday).toBe(5);
		expect(dt.day).toBeGreaterThan(21);
		// Truly the last such Friday: +7 days lands next month.
		expect(dt.plus({ days: 7 }).month).not.toBe(dt.month);
	});

	it('parses "rent due second Monday of September"', () => {
		const result = parseEventInput('rent due second Monday of September');
		const dt = DateTime.fromISO(result.parsed.date!);
		expect(dt.month).toBe(9);
		expect(dt.weekday).toBe(1);
		expect(Math.ceil(dt.day / 7)).toBe(2);
	});

	it('resolves a bare weekday to its next occurrence ("first meeting Monday")', () => {
		const result = parseEventInput('first meeting Monday');
		expect(DateTime.fromISO(result.parsed.date!).weekday).toBe(1);
		expect(result.parsed.title).toBe('first meeting');
	});

	it('resolves "dinner friday" to Friday with title "dinner"', () => {
		const result = parseEventInput('dinner friday');
		expect(DateTime.fromISO(result.parsed.date!).weekday).toBe(5);
		expect(result.parsed.title).toBe('dinner');
	});
});

describe('Reminders ("remind me 30 min before")', () => {
	const cases: Array<[string, number]> = [
		['dentist tomorrow at 3pm remind me 30 min before', 30],
		['call mom Friday remind me 1 hour before', 60],
		['flight Monday at 6am remind me 1 day before', 1440],
		['party Saturday remind me 2 days before', 2880],
		['standup daily remind me 15 minutes before', 15],
		['lunch Friday reminder 2 hours before', 120]
	];
	for (const [input, minutes] of cases) {
		it(`parses "${input}" as ${minutes} minutes`, () => {
			expect(parseEventInput(input).parsed.reminderMinutes).toBe(minutes);
		});
	}

	it('ignores "remember" without a reminder shape ("remember the milk tomorrow")', () => {
		expect(parseEventInput('remember the milk tomorrow').parsed.reminderMinutes).toBeUndefined();
	});
});

describe('Calendar targeting ("on the family calendar")', () => {
	const cases: Array<[string, string]> = [
		['dinner Friday on the family calendar', 'family calendar'],
		['sync Monday to my work calendar', 'work calendar'],
		['lunch Tuesday on personal calendar', 'personal calendar']
	];
	for (const [input, name] of cases) {
		it(`parses "${input}" as calendar "${name}"`, () => {
			expect(parseEventInput(input).parsed.calendarName).toBe(name);
		});
	}

	it('ignores bare "calendar" without a target ("calendar meeting Friday")', () => {
		expect(parseEventInput('calendar meeting Friday').parsed.calendarName).toBeUndefined();
	});
});

describe('Invite verbs ("invite mom")', () => {
	const cases: Array<[string, string[]]> = [
		['lunch Friday invite mom', ['mom']],
		['dinner Saturday invite jay and mo', ['jay', 'mo']],
		['party Sunday invite the team', ['the team']]
	];
	for (const [input, names] of cases) {
		it(`parses "${input}" as inviting ${names.join(' + ')}`, () => {
			const result = parseEventInput(input);
			for (const n of names) expect(result.parsed.attendants ?? []).toContain(n);
		});
}
});


describe('Parser performance', () => {
	const CORPUS = [
		'meeting this Friday',
		'party on July 12th',
		'launch on wednesdays, sept 23 & 30 from 5:30-6:30pm',
		'a5pm disc golf at independence park. with jay and the league',
		'yoga every Tuesday for 6 weeks',
		'standup daily for 10 days',
		'yoga every Monday until Dec 15',
		'standup every Mon, Wed, Fri at 9am',
		'trash weekdays at 7am',
		'party first Friday of October',
		'deadline last Friday of the month',
		'dentist tomorrow at 3pm remind me 30 min before',
		'dinner Friday on the family calendar',
		'lunch Friday invite mom',
		'soccer practice every Tuesday at 4pm',
		'Clients & Friends Appreciation Night 6:00PM - 8:00PM',
		'rent due monthly on the 15th',
		'payday every other week for 3 months',
		'flight Monday at 6am remind me 1 day before',
		'lunch'
	];

	it('parses an everyday corpus instantly (mean < 15ms, 200 parses < 4000ms)', () => {
		for (const input of CORPUS) parseEventInput(input); // warmup
		const t0 = performance.now();
		for (let r = 0; r < 10; r++) for (const input of CORPUS) parseEventInput(input);
		const total = performance.now() - t0;
		const mean = total / (CORPUS.length * 10);
		console.log(`NLP bench: ${total.toFixed(1)}ms total, ${mean.toFixed(3)}ms mean`);
		expect(mean).toBeLessThan(15);
		expect(total).toBeLessThan(4000);
	});
});

describe('Location priority', () => {
	it('keeps an explicit "location:" over NLP place guesses', () => {
		const result = parseEventInput('team meeting Friday location: HQ');
		expect(result.parsed.location).toBe('HQ');
	});
});


describe('Multiple explicit dates ("sept 23 & 30")', () => {
	it('parses "launch on wednesdays, sept 23 & 30 from 5:30-6:30pm" as two dates', () => {
		const result = parseEventInput('launch on wednesdays, sept 23 & 30 from 5:30-6:30pm');
		expect(result.parsed.dates).toHaveLength(2);
		expect(result.parsed.dates![0]).toBe(result.parsed.date);
		expect(result.parsed.dates![0].slice(0, 7)).toBe(result.parsed.dates![1].slice(0, 7));
		expect(result.parsed.dates![0].slice(8)).toBe('23');
		expect(result.parsed.dates![1].slice(8)).toBe('30');
	});

	it('parses "book club sept 5, 12, and 19" as three dates', () => {
		const result = parseEventInput('book club sept 5, 12, and 19');
		expect(result.parsed.dates).toHaveLength(3);
		expect(result.parsed.dates!.map((d) => d.slice(8))).toEqual(['05', '12', '19']);
	});

	it('leaves single dates alone ("dinner friday", "party july 12")', () => {
		expect(parseEventInput('dinner friday').parsed.dates).toBeUndefined();
		expect(parseEventInput('party july 12').parsed.dates).toBeUndefined();
		expect(parseEventInput('rent due monthly on the 15th').parsed.dates).toBeUndefined();
	});
});

describe('Clean titles', () => {
	const cases: Array<[string, string]> = [
		['launch on wednesdays, sept 23 & 30 from 5:30-6:30pm', 'launch'],
		['yoga every Tuesday for 6 weeks at 6pm', 'yoga'],
		['dentist tomorrow at 3pm remind me 30 min before', 'dentist'],
		['dinner Friday on the family calendar', 'dinner'],
		['team sync weekly on Mon & Wed at 9am', 'team sync']
	];
	for (const [input, title] of cases) {
		it(`titles "${input}" as "${title}"`, () => {
			expect(parseEventInput(input).parsed.title).toBe(title);
		});
	}

	it('falls back to the raw text when stripping leaves nothing ("sept 23")', () => {
		const title = parseEventInput('sept 23').parsed.title ?? '';
		expect(title.length).toBeGreaterThan(0);
	});
});
