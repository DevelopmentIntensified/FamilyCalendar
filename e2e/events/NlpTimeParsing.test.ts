import { test, expect } from '@playwright/test';
import { DateTime } from 'luxon';
import { parseEventInput } from '../../src/lib/server/services/naturalLanguageService';

test.describe('NLP Time Parsing', () => {
	test('should parse 9:00 AM as start time', async () => {
		const input = 'PM Certification 4 Days Classroom Training in Lynchburg, VA Tue, May 26 • 9:00 AM Lynchburg, VA From $1,659.95';
		const result = parseEventInput(input);

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
