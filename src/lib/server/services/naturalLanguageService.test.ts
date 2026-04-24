import { describe, it, expect } from 'vitest';
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
			expect(result.parsed.location).toBeDefined();
		});

		it('parses hiking trip', () => {
			const result = parseEventInput(
				"We are doing a team building hiking trip early tomorrow morning, leaving at 6 AM and returning by 2 PM from the Blue Ridge Trailhead."
			);
			expect(result.parsed.startTime).toBe('06:00');
			expect(result.parsed.date).toBeDefined();
		});

		it('parses birthday dinner', () => {
			const result = parseEventInput(
				"I plan to organize a surprise birthday dinner for Sarah, kicking off at 6 PM on Saturday at The Olive Garden and wrapping up around 9 PM."
			);
			expect(result.parsed.startTime).toBe('18:00');
			expect(result.parsed.endTime).toBe('21:00');
			expect(result.parsed.location).toBeDefined();
		});

		it('parses charity run', () => {
			const result = parseEventInput(
				"I'm putting on a 5k charity run next month, with the race beginning at 8 AM on May 15th and finishing around 11 AM at City Park."
			);
			expect(result.parsed.startTime).toBe('08:00');
			expect(result.parsed.date).toBeDefined();
		});

		it('parses workshop', () => {
			const result = parseEventInput(
				"We are hosting a workshop on financial literacy, scheduled from 10 AM to 1 PM next Wednesday at the Community Center."
			);
			expect(result.parsed.startTime).toBe('10:00');
			expect(result.parsed.endTime).toBe('13:00');
		});

		it('parses potluck', () => {
			const result = parseEventInput(
				"We are cooking a community potluck dinner this Sunday, starting at 5 PM and continuing until 9 PM at the neighborhood clubhouse."
			);
			expect(result.parsed.startTime).toBe('17:00');
			expect(result.parsed.endTime).toBe('21:00');
		});

		it('parses flash mob', () => {
			const result = parseEventInput(
				"We are staging a flash mob in the downtown square, starting at noon this Friday and lasting for about 15 minutes."
			);
			expect(result.parsed.startTime).toBe('12:00');
		});

		it('parses meditation session', () => {
			const result = parseEventInput(
				"I'm leading a meditation session for stress relief, beginning at 6 AM tomorrow at the yoga studio and finishing at 7 AM."
			);
			expect(result.parsed.startTime).toBe('06:00');
			expect(result.parsed.endTime).toBe('07:00');
		});

		it('parses beach day with sunset', () => {
			const result = parseEventInput(
				"Us three friends are hitting the beach this Saturday, arriving at 10 AM and staying until sunset."
			);
			expect(result.parsed.startTime).toBe('10:00');
			expect(result.parsed.endTime).toBe('20:00');
		});

		it('parses game night late', () => {
			const result = parseEventInput(
				"You and I and the rest of the group are hosting a game night this Friday, starting at 7 PM and running late into the evening."
			);
			expect(result.parsed.startTime).toBe('19:00');
			expect(result.parsed.endTime).toBe('23:00');
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
	});
});