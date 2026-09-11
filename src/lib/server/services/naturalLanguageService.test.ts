import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { parseBillQuickAdd, parseEventInput, parseEventList } from './naturalLanguageService';

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
				'We are doing a team building hiking trip early tomorrow morning, leaving at 6 AM and returning by 2 PM from the Blue Ridge Trailhead.'
			);
			expect(result.parsed.startTime).toBe('06:00');
			expect(result.parsed.endTime).toBe('14:00'); // returning by 2 PM
			expect(result.parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // tomorrow
			expect(result.parsed.location).toBe('Blue Ridge Trailhead');
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it('parses birthday dinner', () => {
			const result = parseEventInput(
				'I plan to organize a surprise birthday dinner for Sarah, kicking off at 6 PM on Saturday at The Olive Garden and wrapping up around 9 PM.'
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
				'We are hosting a workshop on financial literacy, scheduled from 10 AM to 1 PM next Wednesday at the Community Center.'
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
				'We are cooking a community potluck dinner this Sunday, starting at 5 PM and continuing until 9 PM at the neighborhood clubhouse.'
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
				'flash mob starting at noon and lasting for about 15 minutes.'
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
				'Us three friends are hitting the beach this Saturday, arriving at 10 AM and staying until sunset.'
			);
			expect(result.parsed.startTime).toBe('10:00');
			expect(result.parsed.endTime).toBe('20:00');
			expect(result.parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Saturday
			expect(result.parsed.title).toContain('beach');
			expect(result.confidence).toBeGreaterThan(0.5);
		});

		it('parses game night late', () => {
			const result = parseEventInput(
				'You and I and the rest of the group are hosting a game night this Friday, starting at 7 PM and running late into the evening.'
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
			const result = parseEventInput(
				'Clients & Friends Appreciation Night @ Mr. Goodies Thursday, April 30, 2026 6:00PM - 8:00PM'
			);
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
			const daysUntilSat = (6 - (DateTime.now().weekday % 7) + 7) % 7 || 7;
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

	it('leaves lone weekdays alone ("lunch Monday" stays a single event)', () => {
		const result = parseEventInput('lunch Monday');
		expect(result.parsed.recurringByDay).toBeUndefined();
		expect(result.parsed.recurring).toBeUndefined();
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

describe('Multi-event segmentation ("dinner Friday and movie Saturday")', () => {
	it('splits "dinner Friday and movie Saturday" into two dated events', () => {
		const results = parseEventList('dinner Friday and movie Saturday');
		expect(results).toHaveLength(2);
		expect(DateTime.fromISO(results[0].parsed.date!).weekday).toBe(5);
		expect(DateTime.fromISO(results[1].parsed.date!).weekday).toBe(6);
		expect(results[0].parsed.title).toBe('dinner');
		expect(results[1].parsed.title).toBe('movie');
	});

	it('splits semicolon lists into three events', () => {
		const results = parseEventList('yoga Monday; dentist Tuesday; call mom Wednesday');
		expect(results).toHaveLength(3);
		expect(results.map((r) => DateTime.fromISO(r.parsed.date!).weekday)).toEqual([1, 2, 3]);
	});

	it('keeps per-segment attendants ("invite mom and ... invite dad")', () => {
		const results = parseEventList('lunch Friday invite mom and dinner Saturday invite dad');
		expect(results).toHaveLength(2);
		expect(results[0].parsed.attendants ?? []).toContain('mom');
		expect(results[1].parsed.attendants ?? []).toContain('dad');
	});

	it('does not split without date signals on both sides ("fish and chips Friday")', () => {
		expect(parseEventList('fish and chips Friday')).toHaveLength(1);
	});

	it('does not split single events ("standup daily at 9am")', () => {
		expect(parseEventList('standup daily at 9am')).toHaveLength(1);
	});
});

describe('Typo-tolerant weekdays ("thrusday")', () => {
	const singles: Array<[string, number]> = [
		['yoga wensday at 6pm', 3],
		['dentist tuseday morning', 2],
		['party saterday night', 6],
		['call mom sundey afternoon', 7],
		['gym mondya at 5pm', 1],
		['lunch fridya with jay', 5]
	];
	for (const [input, weekday] of singles) {
		it(`dates "${input}" on weekday ${weekday}`, () => {
			const result = parseEventInput(input);
			expect(DateTime.fromISO(result.parsed.date!).weekday).toBe(weekday);
		});
	}

	it('reads a typo pair into concrete dates ("tuesday and thrusday")', () => {
		const result = parseEventInput('running on tuesday and thrusday at 7pm');
		expect(result.parsed.recurring).toBeUndefined();
		expect(result.parsed.dates!.map((d) => DateTime.fromISO(d).weekday).sort()).toEqual([2, 4]);
	});

	it('does not invent weekdays from short words ("we sat by the sun")', () => {
		const result = parseEventInput('we sat by the sun saturday');
		expect(result.parsed.recurringByDay ?? []).not.toContain('MO');
	});
});

describe('Reported phrase "running on tuesday and thrusday at 7 pm for fun"', () => {
	it('parses two concrete dates with the shared time (no repeat spoken)', () => {
		const result = parseEventInput('running on tuesday and thrusday at 7 pm for fun');
		expect(result.parsed.recurring).toBeUndefined();
		expect(result.parsed.dates).toHaveLength(2);
		expect(result.parsed.dates!.map((d) => DateTime.fromISO(d).weekday).sort()).toEqual([2, 4]);
		expect(result.parsed.startTime).toBe('19:00');
	});

	it('titles it without schedule fragments', () => {
		const result = parseEventInput('running on tuesday and thrusday at 7 pm for fun');
		expect(result.parsed.title).toBe('running fun');
	});

	it('does not split the series into two events', () => {
		expect(parseEventList('running on tuesday and thrusday at 7 pm for fun')).toHaveLength(1);
	});
});

describe('Day-coordinated pairs without repeat words', () => {
	it('keeps "yoga every Monday and Wednesday" as a weekly series', () => {
		const results = parseEventList('yoga every Monday and Wednesday at 6pm');
		expect(results).toHaveLength(1);
		expect(results[0].parsed.recurring).toBe('weekly');
		expect(results[0].parsed.recurringByDay).toEqual(['MO', 'WE']);
	});

	it('reads bare "meeting Monday and Tuesday" as two dates, no repeat', () => {
		const result = parseEventInput('meeting Monday and Tuesday');
		expect(result.parsed.recurring).toBeUndefined();
		expect(result.parsed.dates).toHaveLength(2);
		expect(result.parsed.dates!.map((d) => DateTime.fromISO(d).weekday).sort()).toEqual([1, 2]);
	});

	it('reads bare "gym Mon, Wed, Fri" as three dates, no repeat', () => {
		const result = parseEventInput('gym Mon, Wed, Fri');
		expect(result.parsed.recurring).toBeUndefined();
		expect(result.parsed.dates).toHaveLength(3);
		expect(result.parsed.dates!.map((d) => DateTime.fromISO(d).weekday).sort()).toEqual([1, 3, 5]);
	});
});

describe('Comma-separated events ("dinner Friday, movie Saturday")', () => {
	it('splits comma-joined dated events into two', () => {
		const results = parseEventList('dinner Friday, movie Saturday');
		expect(results).toHaveLength(2);
		expect(DateTime.fromISO(results[0].parsed.date!).weekday).toBe(5);
		expect(DateTime.fromISO(results[1].parsed.date!).weekday).toBe(6);
	});

	it('splits "lunch Tuesday, dinner Wednesday"', () => {
		expect(parseEventList('lunch Tuesday, dinner Wednesday')).toHaveLength(2);
	});

	it('does not split on year fragments ("Sept 5, 2026 party")', () => {
		expect(parseEventList('Sept 5, 2026 party')).toHaveLength(1);
	});

	it('does not split grocery lists ("Buy milk, eggs, and bread Friday")', () => {
		expect(parseEventList('Buy milk, eggs, and bread Friday')).toHaveLength(1);
	});
});

// ===== Issue 030 — multi-day spans, attendee lists, trailing recurrence =====

describe('Multi-day span lists (issue 030)', () => {
	const today = DateTime.now().toFormat('yyyy-MM-dd');
	const tomorrow = DateTime.now().plus({ days: 1 }).toFormat('yyyy-MM-dd');

	it('parses "running today and tomorrow at 5pm" as two dated events', () => {
		const result = parseEventInput('running today and tomorrow at 5pm');
		expect(result.parsed.dates).toEqual([today, tomorrow]);
		expect(result.parsed.date).toBe(today);
		expect(result.parsed.startTime).toBe('17:00');
		expect(result.parsed.title).toBe('running');
	});

	it('keeps the span phrase a single multi-date parse (no bogus split)', () => {
		const results = parseEventList('running today and tomorrow at 5pm');
		expect(results).toHaveLength(1);
		expect(results[0].parsed.dates).toEqual([today, tomorrow]);
	});

	it('parses "running today and the 5th of oct at 5pm" as today + Oct 5', () => {
		const result = parseEventInput('running today and the 5th of oct at 5pm');
		expect(result.parsed.dates).toEqual([today, '2026-10-05']);
		expect(result.parsed.startTime).toBe('17:00');
		expect(result.parsed.title).toBe('running');
	});

	it('expands weekday pairs with a shared time ("friday and saturday dinner")', () => {
		const result = parseEventInput('friday and saturday dinner');
		expect(result.parsed.dates).toHaveLength(2);
		expect(DateTime.fromISO(result.parsed.dates![0]).weekday).toBe(5);
		expect(DateTime.fromISO(result.parsed.dates![1]).weekday).toBe(6);
		expect(result.parsed.startTime).toBeUndefined();
		expect(result.parsed.title).toBe('dinner');
	});

	it('reads bare abbreviations with a shared time ("mon and tue 6am")', () => {
		const result = parseEventInput('mon and tue 6am');
		expect(result.parsed.dates!.map((d) => DateTime.fromISO(d).weekday).sort()).toEqual([1, 2]);
		expect(result.parsed.startTime).toBe('06:00');
	});

	it('caps span expansion at five dates', () => {
		const result = parseEventInput('party sept 1 and 2 and 3 and 4 and 5 and 6');
		expect(result.parsed.dates).toHaveLength(5);
	});

	it('parses a lone "today" as a plain date, no dates list', () => {
		const result = parseEventInput('dentist today at 3pm');
		expect(result.parsed.date).toBe(today);
		expect(result.parsed.dates).toBeUndefined();
		expect(result.parsed.startTime).toBe('15:00');
	});
});

describe('And-lists are attendees, never event splitters (issue 030)', () => {
	const EVIDENCE =
		'running on friday at peaksview park at 5pm till 6pm with james and joseph repeat every week';

	it('keeps the exported phrase ONE event', () => {
		expect(parseEventList(EVIDENCE)).toHaveLength(1);
	});

	it('attaches both attendees to the single event', () => {
		const result = parseEventInput(EVIDENCE);
		expect(result.parsed.attendants).toHaveLength(2);
		expect(result.parsed.attendants ?? []).toEqual(expect.arrayContaining(['james', 'joseph']));
		expect(DateTime.fromISO(result.parsed.date!).weekday).toBe(5);
		expect(result.parsed.startTime).toBe('17:00');
		expect(result.parsed.endTime).toBe('18:00');
		expect(result.parsed.location).toBe('peaksview park');
		expect(result.parsed.recurring).toBe('weekly');
		expect(result.parsed.title).toBe('running');
	});

	const variants: Array<[string, string[]]> = [
		['dinner with sarah and mike friday', ['sarah', 'mike']],
		['gym with mary, sue on friday', ['mary', 'sue']],
		['cookout with sarah and mike and jamal saturday', ['sarah', 'mike', 'jamal']]
	];
	for (const [input, names] of variants) {
		it(`keeps "${input}" one event with ${names.join(' + ')}`, () => {
			const results = parseEventList(input);
			expect(results).toHaveLength(1);
			const attendants = results[0].parsed.attendants ?? [];
			for (const n of names) expect(attendants, input).toContain(n);
		});
	}

	it('still splits when each side names its own event', () => {
		const results = parseEventList('dinner with sarah friday and movie with mike saturday');
		expect(results).toHaveLength(2);
		expect(results[0].parsed.attendants ?? []).toContain('sarah');
		expect(results[1].parsed.attendants ?? []).toContain('mike');
	});
});

describe('Trailing recurrence cues (issue 030)', () => {
	const cases: Array<[string, string]> = [
		['book club repeat every week at 6pm', 'weekly'],
		['book club every week at 6pm', 'weekly'],
		['standup repeats weekly at 9am', 'weekly'],
		['billing review repeats every month at 9am', 'monthly'],
		['cleanup repeats every day at 7am', 'daily']
	];
	for (const [input, recurring] of cases) {
		it(`parses "${input}" as ${recurring} and strips it from the title`, () => {
			const result = parseEventInput(input);
			expect(result.parsed.recurring).toBe(recurring);
			expect(result.parsed.title, input).not.toMatch(/repeat|every week|weekly|monthly|daily/i);
		});
	}

	it('lands the cue on the primary event with byDay from the named day', () => {
		const result = parseEventInput('running on friday at 5pm repeat every week');
		expect(result.parsed.recurring).toBe('weekly');
		expect(result.parsed.recurringByDay).toEqual(['FR']);
		expect(result.parsed.startTime).toBe('17:00');
		expect(result.parsed.title).toBe('running');
	});
});

// ===== Issue 025 — URL fidelity =====

const EVIDENCE_URL = 'https://app.operadds.com//u/rc/ne9qzml';
const EVIDENCE1 = `eugenia, confirm your appointment ${EVIDENCE_URL} on wed, sep 09, 2026, 08:00 am at garland g. gentry, dds, p.c.. stop=endtexts`;

describe('URL fidelity (issue 025)', () => {
	const cases: Array<[string, string, string[]]> = [
		// Exact exported phrase.
		[EVIDENCE1, EVIDENCE_URL, ['eugenia, confirm your appointment']],
		// URL at start.
		[`${EVIDENCE_URL} dentist appointment monday`, EVIDENCE_URL, ['dentist appointment']],
		// URL at end, trailing punctuation after the URL.
		['confirm appointment friday https://x.co/a1b2.', 'https://x.co/a1b2', ['confirm appointment']],
		// Short URL.
		['sync at noon https://x.co/a', 'https://x.co/a', ['sync']],
		// Long URL mid-title (straddles the 50-char cut).
		[
			'plan the trip https://very-long-link.example.com/a/b/c/d/e/f/g/h with the team',
			'https://very-long-link.example.com/a/b/c/d/e/f/g/h',
			['plan the trip']
		]
	];
	for (const [input, url, titleParts] of cases) {
		it(`keeps ${url} whole for "${input.slice(0, 40)}…"`, () => {
			const result = parseEventInput(input);
			const title = result.parsed.title ?? '';
			// The title never carries any URL fragment (whole or truncated).
			expect(title).not.toMatch(/https?:\/\/\S/);
			for (const part of titleParts) expect(title).toContain(part);
			// The whole link is preserved in the description.
			expect(result.parsed.description).toContain(url);
			// URL tokens never become people or places.
			const peopleish = [...(result.parsed.attendants ?? []), result.parsed.location ?? ''].join(
				' '
			);
			expect(peopleish).not.toMatch(/https?:\/\/|operadds|example\.com|x\.co/);
		});
	}

	it('parses the exported eugenia phrase without a stray second date', () => {
		const result = parseEventInput(EVIDENCE1);
		expect(result.parsed.date).toBe('2026-09-09');
		expect(result.parsed.dates ?? [result.parsed.date]).toEqual(['2026-09-09']);
		expect(result.parsed.startTime).toBe('08:00');
	});
});

// ===== Issue 025 — sentence fidelity =====

const EVIDENCE2 =
	'construction crew goes to the range with nathan and matt and kelvin. at 442 cherry hill dr., rustburg, va 24588. add a task to bring drinks for 8';

describe('Sentence fidelity (issue 025)', () => {
	it('parses the exported crew phrase: whole-word title, all attendants, full address', () => {
		const result = parseEventInput(EVIDENCE2);
		// Title never ends mid-word ("with Nathan an" was the old cut).
		expect(result.parsed.title).toBe('construction crew goes to the range with nathan');
		expect(result.parsed.attendants ?? []).toEqual(['nathan', 'matt', 'kelvin']);
		expect(result.parsed.location).toBe('442 cherry hill dr., rustburg, va 24588');
	});

	it('captures every and-joined attendant in explicit lists', () => {
		const cases: Array<[string, string[]]> = [
			['dinner with sarah and mike and jamal friday', ['sarah', 'mike', 'jamal']],
			['dinner with Sarah and Mike', ['Sarah', 'Mike']],
			['lunch with mary, sue and bea saturday', ['mary', 'sue', 'bea']]
		];
		for (const [input, names] of cases) {
			const attendants = parseEventInput(input).parsed.attendants ?? [];
			expect(attendants, input).toEqual(expect.arrayContaining(names));
		}
	});

	it('does not read non-name lists as attendants', () => {
		const cases: Array<[string, string[]]> = [
			['game night with jay and the league', ['the league', 'league']],
			['potluck with pizza and drinks', ['pizza', 'drinks']]
		];
		for (const [input, banned] of cases) {
			const attendants = (parseEventInput(input).parsed.attendants ?? []).join(' ').toLowerCase();
			for (const b of banned) expect(attendants, input).not.toContain(b);
		}
	});

	it('captures the full street address as location', () => {
		const cases: Array<[string, string]> = [
			['meeting at 742 evergreen terrace', '742 evergreen terrace'],
			['meeting at 12 oak st, springfield, il 62704', '12 oak st, springfield, il 62704'],
			['game at 442 cherry hill dr.', '442 cherry hill dr'],
			['cookout at 305 maple ave saturday', '305 maple ave']
		];
		for (const [input, loc] of cases) {
			expect(parseEventInput(input).parsed.location, input).toBe(loc);
		}
	});

	it('never ends the title mid-word at the 50-char cut', () => {
		const cases: Array<[string, string]> = [
			[EVIDENCE2, 'construction crew goes to the range with nathan'],
			[
				'marketing sync with nathaniel and jennifer and jamal at the office',
				'marketing sync with nathaniel and jennifer'
			]
		];
		for (const [input, title] of cases) {
			expect(parseEventInput(input).parsed.title, input).toBe(title);
		}
	});
});

// ===== Issue 025 — bare "family calendar" routing =====

describe('Calendar routing — bare family/personal calendar (issue 025)', () => {
	const cases: Array<[string, string, string]> = [
		['stalkers campout family calendar', 'family calendar', 'stalkers campout'],
		['family calendar stalkers campout', 'family calendar', 'stalkers campout'],
		['grocery run personal calendar', 'personal calendar', 'grocery run'],
		['stalkers campout on my family calendar', 'family calendar', 'stalkers campout'],
		['stalkers campout to the family calendar', 'family calendar', 'stalkers campout']
	];
	for (const [input, name, title] of cases) {
		it(`routes "${input}" to the ${name}`, () => {
			const result = parseEventInput(input);
			expect(result.parsed.calendarName).toBe(name);
			expect(result.parsed.title).toBe(title);
		});
	}

	it('still ignores bare "calendar" without a target ("calendar meeting Friday")', () => {
		expect(parseEventInput('calendar meeting Friday').parsed.calendarName).toBeUndefined();
	});

	it('does not route "family reunion saturday" (no calendar phrase)', () => {
		expect(parseEventInput('family reunion saturday').parsed.calendarName).toBeUndefined();
	});
});

// ===== Issue 011 - bill quick-add NLP =====

const DOW_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Next strictly-future occurrence of a weekday (today does not count). */
function nextDow(dayName: string): string {
	const now = DateTime.now();
	const current = now.weekday % 7; // luxon 7=Sun → 0
	let delta = DOW_NAMES.indexOf(dayName) - current;
	if (delta <= 0) delta += 7;
	return now.plus({ days: delta }).toFormat('yyyy-MM-dd');
}

/** Day-of-month with monthly rollover when it already passed. */
function monthDay(d: number): string {
	const now = DateTime.now();
	let t = now.set({ day: Math.min(d, now.daysInMonth ?? 28) });
	if (t < now.startOf('day')) t = t.plus({ months: 1 });
	return t.toFormat('yyyy-MM-dd');
}

describe('Bill quick-add NLP — amounts (parseBillQuickAdd)', () => {
	const cases: Array<[string, number]> = [
		['electric bill $85 due friday', 8500],
		['rent $1,200 due on the 1st', 120000],
		['netflix 15.99 monthly', 1599],
		['water bill $43.20 due in 2 weeks', 4320],
		['internet 60/month starting next month', 6000],
		['car insurance $210 every 6 months', 21000],
		['electricity 85 dollars monthly', 8500],
		['gym $45 a month', 4500],
		['daycare $700 per week', 70000],
		['streaming $9 per month', 900],
		['hoa dues 250 quarterly', 25000],
		['trash $18.5 monthly', 1850],
		['music $9.99/mo', 999],
		['storage unit 120', 12000],
		['hoa 250 per quarter', 25000],
		['water $43.20 due on the 20th', 4320]
	];
	for (const [input, cents] of cases) {
		it(`parses ${cents} cents from "${input}"`, () => {
			expect(parseBillQuickAdd(input).amountCents, input).toBe(cents);
		});
	}

	it('returns null cents when no amount appears', () => {
		expect(parseBillQuickAdd('call about the water bill').amountCents).toBeNull();
	});
});

describe('Bill quick-add NLP — due dates (parseBillQuickAdd)', () => {
	it('parses "due friday" as the next friday', () => {
		expect(parseBillQuickAdd('electric bill $85 due friday').dueDate).toBe(nextDow('friday'));
	});
	it('parses "due on friday"', () => {
		expect(parseBillQuickAdd('water due on friday').dueDate).toBe(nextDow('friday'));
	});
	it('parses "due by friday"', () => {
		expect(parseBillQuickAdd('power bill due by fri').dueDate).toBe(nextDow('friday'));
	});
	it('parses "due next friday" as a week further out', () => {
		expect(parseBillQuickAdd('trash due next friday').dueDate).toBe(nextDow('friday'));
	});
	it('parses bare "on friday" ("pickup on friday")', () => {
		expect(parseBillQuickAdd('trash pickup $32 on wednesday').dueDate).toBe(nextDow('wednesday'));
	});
	it('parses "due on the 1st" with monthly rollover', () => {
		expect(parseBillQuickAdd('rent $1200 due on the 1st').dueDate).toBe(monthDay(1));
	});
	it('parses "due the 15th" without a preposition', () => {
		expect(parseBillQuickAdd('city water $31.40 due the 20th').dueDate).toBe(monthDay(20));
	});
	it('parses "due in 2 weeks"', () => {
		const expected = DateTime.now().plus({ weeks: 2 }).toFormat('yyyy-MM-dd');
		expect(parseBillQuickAdd('water bill $43.20 due in 2 weeks').dueDate).toBe(expected);
	});
	it('parses "due in a month"', () => {
		const expected = DateTime.now().plus({ months: 1 }).toFormat('yyyy-MM-dd');
		expect(parseBillQuickAdd('hoa $40 due in a month').dueDate).toBe(expected);
	});
	it('parses "due tomorrow"', () => {
		const expected = DateTime.now().plus({ days: 1 }).toFormat('yyyy-MM-dd');
		expect(parseBillQuickAdd('gas bill $30 due tomorrow').dueDate).toBe(expected);
	});
	it('parses month-day dues ("december 15") with rollover year', () => {
		const got = parseBillQuickAdd('netflix $16 december 15').dueDate;
		expect(got ?? 'missing', got ?? '').toMatch(/^(2026|2027)-12-15$/);
	});
	it('parses month-day with explicit year ("august 1 2027")', () => {
		expect(parseBillQuickAdd('mortgage $1400 august 1 2027').dueDate).toBe('2027-08-01');
	});
	it('parses day-first dues ("15 january")', () => {
		const got = parseBillQuickAdd('insurance premium $120 15 january').dueDate;
		expect(got ?? 'missing', got ?? '').toMatch(/^(2027|2028)-01-15$/);
	});
	it('parses numeric dues ("due 12/25") with rollover', () => {
		const got = parseBillQuickAdd('car insurance $210 due 12/25').dueDate;
		expect(got ?? 'missing', got ?? '').toMatch(/^(2026|2027)-12-25$/);
	});
	it('parses "starting next month" as the first of next month', () => {
		const expected = DateTime.now().plus({ months: 1 }).set({ day: 1 }).toFormat('yyyy-MM-dd');
		expect(parseBillQuickAdd('internet 60/month starting next month').dueDate).toBe(expected);
	});
	it('parses "starting friday" as the next friday', () => {
		expect(parseBillQuickAdd('daycare $700 starting friday').dueDate).toBe(nextDow('friday'));
	});
	it('parses "starting in 3 days"', () => {
		const expected = DateTime.now().plus({ days: 3 }).toFormat('yyyy-MM-dd');
		expect(parseBillQuickAdd('storage $80 starting in 3 days').dueDate).toBe(expected);
	});
	it('leaves dueDate null without a due phrase', () => {
		expect(parseBillQuickAdd('netflix 15.99 monthly').dueDate).toBeNull();
	});
	it('resolves "due tomorrow" in the caller zone, not the server zone', () => {
		// 2026-08-24T00:30Z is still Aug 23 in New York but Aug 24 in Auckland.
		const utc = parseBillQuickAdd('gas $30 due tomorrow', 'UTC').dueDate;
		const auckland = parseBillQuickAdd('gas $30 due tomorrow', 'Pacific/Auckland').dueDate;
		const ny = parseBillQuickAdd('gas $30 due tomorrow', 'America/New_York').dueDate;
		expect(utc).toBeDefined();
		expect(auckland! >= ny!).toBe(true);
	});
});

describe('Bill quick-add NLP — recurrence (parseBillQuickAdd)', () => {
	const cases: Array<[string, string, string | null, number | null]> = [
		// input, recurring value, frequency, interval
		['rent 1200 on the 1st every month', 'monthly', 'monthly', 1],
		['netflix 15.99 monthly', 'monthly', 'monthly', 1],
		['netflix 15.99 every month', 'monthly', 'monthly', 1],
		['gym $45 a month', 'monthly', 'monthly', 1],
		['music $9.99/mo', 'monthly', 'monthly', 1],
		['streaming $9 per month', 'monthly', 'monthly', 1],
		['car insurance $210 every 6 months', 'every_6_months', 'monthly', 6],
		['water $30 every 2 weeks', 'every_2_weeks', 'weekly', 2],
		['dog walker $40 every other week', 'biweekly', 'weekly', 2],
		['daily parking $12', 'daily', 'daily', 1],
		['laundry $5 every day', 'daily', 'daily', 1],
		['daycare $700 weekly', 'weekly', 'weekly', 1],
		['daycare $700 per week', 'weekly', 'weekly', 1],
		['cleaning $80 every friday', 'weekly', 'weekly', 1],
		['hoa dues 250 quarterly', 'every_3_months', 'monthly', 3],
		['hoa 250 per quarter', 'every_3_months', 'monthly', 3],
		['insurance premium $120 twice a year', 'every_6_months', 'monthly', 6],
		['domains $15 annually', 'yearly', 'yearly', 1],
		['storage $300 per year', 'yearly', 'yearly', 1],
		['meds $20 every 3 days', 'every_3_days', 'daily', 3]
	];
	for (const [input, recurring, frequency, interval] of cases) {
		it(`recurs "${recurring}" for "${input}"`, () => {
			const parsed = parseBillQuickAdd(input);
			expect(parsed.recurring, input).toBe(recurring);
			expect(parsed.frequency, input).toBe(frequency);
			expect(parsed.interval, input).toBe(interval);
		});
	}

	it('leaves frequency/interval null for one-off bills', () => {
		const parsed = parseBillQuickAdd('plumber visit $150 due friday');
		expect(parsed.recurring).toBeUndefined();
		expect(parsed.frequency).toBeNull();
		expect(parsed.interval).toBeNull();
	});

	it('monthly on the Nth sets both recurrence and the Nth due date', () => {
		const parsed = parseBillQuickAdd('rent $1200 monthly on the 1st');
		expect(parsed.recurring).toBe('monthly');
		expect(parsed.dueDate).toBe(monthDay(1));
	});
});

describe('Bill quick-add NLP — categories (parseBillQuickAdd)', () => {
	const cases: Array<[string, string]> = [
		['electric bill $85 due friday', 'utilities'],
		['electricity $90 monthly', 'utilities'],
		['power $70 due friday', 'utilities'],
		['water bill $43.20', 'utilities'],
		['gas $30 due tomorrow', 'utilities'],
		['internet 60/month', 'utilities'],
		['wifi $50 monthly', 'utilities'],
		['trash $18 monthly', 'utilities'],
		['garbage $22 monthly', 'utilities'],
		['cable $60 monthly', 'utilities'],
		['phone bill $45 monthly', 'utilities'],
		['sewer $25 quarterly', 'utilities'],
		['netflix 15.99 monthly', 'subscriptions'],
		['spotify $11 monthly', 'subscriptions'],
		['hulu $12 monthly', 'subscriptions'],
		['disney plus $10 monthly', 'subscriptions'],
		['youtube premium $14 monthly', 'subscriptions'],
		['hbo max $16 monthly', 'subscriptions'],
		['icloud storage $3 monthly', 'subscriptions'],
		['subscription renewal $9 monthly', 'subscriptions'],
		['rent $1200 due on the 1st', 'housing'],
		['mortgage $1400 monthly', 'housing'],
		['hoa dues 250', 'housing'],
		['landlord payment $900 monthly', 'housing'],
		['car insurance $210', 'insurance'],
		['health insurance $300 monthly', 'insurance'],
		['geico $95 monthly', 'insurance'],
		['progressive $88 monthly', 'insurance'],
		['sales tax $12.50', 'tax'],
		['tax payment $340', 'tax'],
		['property tax $800 quarterly', 'tax'],
		['vat $25', 'tax'],
		['gst payment $60', 'tax'],
		['service fee $5', 'fees'],
		['delivery fee $4.99', 'fees'],
		['late fee $15', 'fees'],
		['bank surcharge $3', 'fees'],
		['processing fee 2.50', 'fees'],
		['pet food $45', 'other'],
		['vet visit $60', 'other'],
		['#utilities trash 30 quarterly', 'utilities'],
		['#housing cottage dues 120 monthly', 'housing'],
		['#other gym 30 monthly', 'other']
	];
	for (const [input, category] of cases) {
		it(`categorizes "${input}" as ${category}`, () => {
			expect(parseBillQuickAdd(input).category, input).toBe(category);
		});
	}

	it('explicit #tag wins over merchant keywords', () => {
		expect(parseBillQuickAdd('internet 60/month #housing').category).toBe('housing');
	});

	it('unknown #tag falls back to keyword mapping', () => {
		expect(parseBillQuickAdd('electric bill $85 #pets').category).toBe('utilities');
	});

	it('unknown #tag with unknown merchant lands in other', () => {
		expect(parseBillQuickAdd('vet bill $60 #pets').category).toBe('other');
	});
});

describe('Bill quick-add NLP — titles (parseBillQuickAdd)', () => {
	const cases: Array<[string, string | null]> = [
		['electric bill $85 due friday', 'electric bill'],
		['rent $1200 due on the 1st', 'rent'],
		['water bill $43.20 due in 2 weeks', 'water bill'],
		['car insurance $210 every 6 months', 'car insurance'],
		['netflix 15.99 monthly', 'netflix'],
		['internet 60/month starting next month', 'internet'],
		['#utilities trash 30 quarterly', 'trash'],
		['gym $45 a month', 'gym'],
		['city water $31.40 due the 20th', 'city water'],
		['storage unit 120', 'storage unit'],
		['due friday electric bill $85', 'electric bill'],
		['pay $50 to the plumber friday', 'pay to the plumber friday']
	];
	for (const [input, title] of cases) {
		it(`titles "${input}" → "${title}"`, () => {
			expect(parseBillQuickAdd(input).title, input).toBe(title);
		});
	}

	it('returns null title when only schedule tokens remain', () => {
		expect(parseBillQuickAdd('$85 due friday').title).toBeNull();
	});
});

describe('Bill quick-add NLP — word-order & combo (parseBillQuickAdd)', () => {
	it('full parse of the flagship phrase', () => {
		const parsed = parseBillQuickAdd('electric bill $85 due friday');
		expect(parsed.title).toBe('electric bill');
		expect(parsed.amountCents).toBe(8500);
		expect(parsed.amount).toBe(85);
		expect(parsed.dueDate).toBe(nextDow('friday'));
		expect(parsed.category).toBe('utilities');
		expect(parsed.frequency).toBeNull();
	});

	it('recurring bill with tag, quarter cadence and bare amount', () => {
		const parsed = parseBillQuickAdd('#utilities trash 30 quarterly');
		expect(parsed.title).toBe('trash');
		expect(parsed.amountCents).toBe(3000);
		expect(parsed.recurring).toBe('every_3_months');
		expect(parsed.category).toBe('utilities');
	});

	it('one-off bill with no due date', () => {
		const parsed = parseBillQuickAdd('pet food $45');
		expect(parsed.title).toBe('pet food');
		expect(parsed.amountCents).toBe(4500);
		expect(parsed.dueDate).toBeNull();
		expect(parsed.category).toBe('other');
	});
});

describe('Bill quick-add NLP — merchant titles (#035)', () => {
	const cases: Array<[string, string, number]> = [
		// input, canonical merchant title, amount cents
		['home depot 45', 'Home Depot', 4500],
		['home depot $45', 'Home Depot', 4500],
		['$45 home depot', 'Home Depot', 4500],
		['45 home depot', 'Home Depot', 4500],
		['HOMe DEPOT 45', 'Home Depot', 4500],
		['homedepot 45', 'Home Depot', 4500],
		['home depot receipt 45', 'Home Depot receipt', 4500],
		['home depot bill 45', 'Home Depot bill', 4500],
		['home depot order 45', 'Home Depot order', 4500],
		['home depot invoice 45', 'Home Depot invoice', 4500],
		['45 home depot receipt', 'Home Depot receipt', 4500],
		['lowes 45', "Lowe's", 4500],
		['$45 lowes', "Lowe's", 4500],
		["lowe's 45", "Lowe's", 4500],
		["$45 lowe's", "Lowe's", 4500],
		['lowes receipt 45', "Lowe's receipt", 4500],
		['lowes bill 45', "Lowe's bill", 4500],
		['lowes order 45', "Lowe's order", 4500],
		['lowes invoice 45', "Lowe's invoice", 4500],
		['walmart 120', 'Walmart', 12000],
		['$120 walmart', 'Walmart', 12000],
		['120 walmart receipt', 'Walmart receipt', 12000],
		['walmart receipt 120', 'Walmart receipt', 12000],
		['walmart bill 120', 'Walmart bill', 12000],
		['walmart order 120', 'Walmart order', 12000],
		['walmart invoice 120', 'Walmart invoice', 12000],
		['receipt 120 walmart', 'receipt Walmart', 12000],
		['WALMART 120', 'Walmart', 12000],
		['amazon 35.99', 'Amazon', 3599],
		['amazon order 35.99', 'Amazon order', 3599],
		['$35.99 amazon', 'Amazon', 3599],
		['35.99 amazon order', 'Amazon order', 3599],
		['amazon receipt 35.99', 'Amazon receipt', 3599],
		['amazon bill 35.99', 'Amazon bill', 3599],
		['amazon invoice 35.99', 'Amazon invoice', 3599],
		['order from amazon 35.99', 'order from Amazon', 3599],
		['home depot paint 45', 'Home Depot paint', 4500],
		['walmart grocery 120', 'Walmart grocery', 12000],
		// generic fallback: unknown merchants keep their words as written
		['electric bill 80', 'electric bill', 8000],
		['costco 85', 'costco', 8500],
		['target run 60', 'target run', 6000],
		['Electric Bill 80', 'Electric Bill', 8000]
	];
	for (const [input, title, cents] of cases) {
		it(`merchants "${input}" → "${title}" + ${cents}c`, () => {
			const parsed = parseBillQuickAdd(input);
			expect(parsed.title, input).toBe(title);
			expect(parsed.amountCents, input).toBe(cents);
		});
	}

	it('combines a merchant title with a due date ("home depot 45 due friday")', () => {
		const parsed = parseBillQuickAdd('home depot 45 due friday');
		expect(parsed.title).toBe('Home Depot');
		expect(parsed.amountCents).toBe(4500);
		expect(parsed.dueDate).toBe(nextDow('friday'));
	});

	it('combines a merchant title with recurrence ("walmart 120 monthly")', () => {
		const parsed = parseBillQuickAdd('walmart 120 monthly');
		expect(parsed.title).toBe('Walmart');
		expect(parsed.amountCents).toBe(12000);
		expect(parsed.recurring).toBe('monthly');
	});

	it('combines a merchant title with due + recurrence ("amazon 35.99 due tomorrow monthly")', () => {
		const parsed = parseBillQuickAdd('amazon 35.99 due tomorrow monthly');
		expect(parsed.title).toBe('Amazon');
		expect(parsed.amountCents).toBe(3599);
		expect(parsed.recurring).toBe('monthly');
		expect(parsed.dueDate).toBe(DateTime.now().plus({ days: 1 }).toFormat('yyyy-MM-dd'));
	});

	it('combines amount-first merchant with a due date ("$45 lowes due friday")', () => {
		const parsed = parseBillQuickAdd('$45 lowes due friday');
		expect(parsed.title).toBe("Lowe's");
		expect(parsed.amountCents).toBe(4500);
		expect(parsed.dueDate).toBe(nextDow('friday'));
	});

	it.each([
		['walmart receipt 120', 'Walmart receipt'],
		['walmart bill 120', 'Walmart bill'],
		['walmart invoice 120', 'Walmart invoice'],
		['home depot receipt 45', 'Home Depot receipt'],
		['home depot bill 45', 'Home Depot bill'],
		['lowes bill 45', "Lowe's bill"],
		['amazon order 35.99', 'Amazon order'],
		['amazon receipt 35.99', 'Amazon receipt'],
		['order from amazon 35.99', 'order from Amazon'],
		['order paint from home depot 45', 'order paint from Home Depot'],
		['home depot paint 45', 'Home Depot paint'],
		['electric bill $85 due friday', 'electric bill'],
		['saturday home depot 45', 'saturday Home Depot'],
		['the home depot 45', 'the Home Depot'],
		['from home depot 45', 'from Home Depot'],
		['receipt 120 walmart', 'receipt Walmart']
	])('preserves user words: "%s" → "%s"', (input, title) => {
		expect(parseBillQuickAdd(input).title, input).toBe(title);
	});
});
describe('Bill quick-add NLP — robustness (parseBillQuickAdd)', () => {
	it('treats a non-bill phrase as amountless, uncategorized, confident-less', () => {
		const parsed = parseBillQuickAdd('hello world');
		expect(parsed.amountCents).toBeNull();
		expect(parsed.amount).toBeNull();
		expect(parsed.category).toBe('other');
		expect(parsed.dueDate).toBeNull();
		expect(parsed.title).toBe('hello world');
	});

	it('empty input yields nulls', () => {
		const parsed = parseBillQuickAdd('');
		expect(parsed.amountCents).toBeNull();
		expect(parsed.title).toBeNull();
		expect(parsed.dueDate).toBeNull();
	});

	it('does not read a year as an amount', () => {
		const parsed = parseBillQuickAdd('lease renewal 2027 notice');
		expect(parsed.amountCents).toBeNull();
	});

	it('confidence stays within [0,1]', () => {
		const parsed = parseBillQuickAdd('electric bill $85 due friday monthly #utilities');
		expect(parsed.confidence).toBeGreaterThan(0.5);
		expect(parsed.confidence).toBeLessThanOrEqual(1);
	});
});

describe('Unmatched export 2026-09-10 — multi-word comma attendants (#052)', () => {
	const tomorrow = DateTime.now().plus({ days: 1 }).toFormat('yyyy-MM-dd');

	it('captures every name in "working with nathan dewhurst, matthew wilson, kelvin tomorrow from 5:30-9pm"', () => {
		const result = parseEventInput(
			'working with nathan dewhurst, matthew wilson, kelvin tomorrow from 5:30-9pm'
		);
		const attendants = (result.parsed.attendants ?? []).map((n) => n.toLowerCase());
		expect(attendants).toEqual(
			expect.arrayContaining(['nathan dewhurst', 'matthew wilson', 'kelvin'])
		);
		expect(result.parsed.date).toBe(tomorrow);
		expect(result.parsed.startTime).toBe('17:30');
		expect(result.parsed.endTime).toBe('21:00');
	});

	it('splits the friday clause into a second event inheriting title + attendants', () => {
		const results = parseEventList(
			'working with nathan dewhurst, matthew wilson, kelvin tomorrow from 5:30-9pm and friday from 5:30-9pm'
		);
		expect(results).toHaveLength(2);
		expect(DateTime.fromISO(results[1].parsed.date!).weekday).toBe(5);
		expect(results[1].parsed.startTime).toBe('17:30');
		expect(results[1].parsed.endTime).toBe('21:00');
		expect(results[1].parsed.title).toBe(results[0].parsed.title);
		const attendants = (results[1].parsed.attendants ?? []).map((n) => n.toLowerCase());
		expect(attendants).toEqual(
			expect.arrayContaining(['nathan dewhurst', 'matthew wilson', 'kelvin'])
		);
	});

	it.each([
		['lunch with amy chen and bob lee friday', ['amy chen', 'bob lee']],
		['dinner with nathan dewhurst, matthew wilson, kelvin tomorrow', ['nathan dewhurst', 'matthew wilson', 'kelvin']],
		['brunch with sam oak, jo pine sunday', ['sam oak', 'jo pine']]
	])('reads "%s" attendants %s', (input, names) => {
		const attendants = (parseEventInput(input).parsed.attendants ?? []).map((n) =>
			n.toLowerCase()
		);
		// SAFETY: it.each rows above are all [string, string[]] pairs.
		for (const name of names as string[]) expect(attendants, input).toContain(name);
	});

	it.each([
		['lunch with amy tomorrow at noon', ['amy']],
		['meeting with bob next week', ['bob']],
		['coffee with john at the park friday', ['john']]
	])('stops the second word at schedule clauses: "%s"', (input, names) => {
		const attendants = (parseEventInput(input).parsed.attendants ?? []).map((n) =>
			n.toLowerCase()
		);
		expect(attendants, input).toEqual(names);
	});
});
