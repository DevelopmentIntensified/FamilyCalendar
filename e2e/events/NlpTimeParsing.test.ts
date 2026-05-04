import { test, expect } from '@playwright/test';
import { parseEventInput } from '../../src/lib/server/services/naturalLanguageService';

test.describe('NLP Time Parsing', () => {
	test('should parse 9:00 AM as start time', async () => {
		const input = 'PM Certification 4 Days Classroom Training in Lynchburg, VA Tue, May 26 • 9:00 AM Lynchburg, VA From $1,659.95';
		const result = parseEventInput(input);
		
		console.log('Parsed result:', JSON.stringify(result, null, 2));
		
		expect(result.parsed.date).toBe('2026-05-26');
		expect(result.parsed.startTime).toBe('09:00');
		expect(result.parsed.location).toBe('Lynchburg');
		expect(result.parsed.title).toContain('PM Certification');
	});
});
