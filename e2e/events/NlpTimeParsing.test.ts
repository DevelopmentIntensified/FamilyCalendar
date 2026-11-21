import { test, expect } from '@playwright/test';
import { DateTime } from 'luxon';
import { parseEventQuickAdd } from '$lib/domains/parsing/index.server';

test.describe('NLP Time Parsing', () => {
	test('should parse 9:00 AM as start time', async () => {
		const input =
			'PM Certification 4 Days Classroom Training in Lynchburg, VA Tue, May 26 • 9:00 AM Lynchburg, VA From $1,659.95';
		// Resolve relative dates in the runner's own zone, the way the server does
		// for an anonymous caller (no stored zone ⇒ server-local).
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const result = parseEventQuickAdd(input, { now: new Date(), zone });

		console.log('Parsed result:', JSON.stringify(result, null, 2));

		// The parser resolves a bare "May 26" to the NEXT occurrence after today
		// (same rule as the service: this year's date unless it is already past).
		const now = DateTime.now();
		let year = now.year;
		if (DateTime.fromObject({ year, month: 5, day: 26 }) < now) year += 1;
		const expectedDate = DateTime.fromObject({ year, month: 5, day: 26 }).toFormat('yyyy-MM-dd');

		expect(result.parsed.date).toBe(expectedDate);
		expect(result.parsed.startTime).toBe('09:00');
		expect(result.parsed.location).toBe('Lynchburg');
		expect(result.parsed.title).toContain('PM Certification');
	});
});
