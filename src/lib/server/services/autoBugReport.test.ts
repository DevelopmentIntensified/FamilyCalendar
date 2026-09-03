import { describe, it, expect } from 'vitest';
import { buildAutoBugReport, shouldFileAutoReport, __resetAutoReportThrottle } from './autoBugReport';

describe('buildAutoBugReport', () => {
	it('returns null for 404s', () => {
		expect(buildAutoBugReport({ status: 404, message: 'Not found', path: '/nope', userId: 'u1' })).toBeNull();
	});

	it('maps dashboard paths to the dashboard area', () => {
		const report = buildAutoBugReport({
			status: 500,
			message: 'relation "meals" does not exist',
			path: '/calendar/dashboard',
			userId: 'u1'
		});
		expect(report?.area).toBe('dashboard');
		expect(report?.url).toBe('/calendar/dashboard');
		expect(report?.userId).toBe('u1');
	});

	it('maps calendar paths to calendar, unknown paths to other', () => {
		expect(
			buildAutoBugReport({ status: 500, message: 'boom', path: '/calendar', userId: null })?.area
		).toBe('calendar');
		expect(
			buildAutoBugReport({ status: 500, message: 'boom', path: '/api/events', userId: null })?.area
		).toBe('calendar');
		expect(
			buildAutoBugReport({ status: 500, message: 'boom', path: '/weird', userId: null })?.area
		).toBe('other');
	});

	it('returns null for empty messages', () => {
		expect(buildAutoBugReport({ status: 500, message: '  ', path: '/calendar', userId: null })).toBeNull();
	});

	it('truncates long messages with a clear prefix', () => {
		const report = buildAutoBugReport({ status: 500, message: 'x'.repeat(6000), path: '/', userId: null });
		expect(report!.description.startsWith('[auto-filed 500]')).toBe(true);
		expect(report!.description.length).toBeLessThanOrEqual(5000);
	});
});

describe('shouldFileAutoReport', () => {
	it('throttles repeat filings for the same failure', () => {
		__resetAutoReportThrottle();
		expect(shouldFileAutoReport('500:/calendar:boom')).toBe(true);
		expect(shouldFileAutoReport('500:/calendar:boom')).toBe(false);
		expect(shouldFileAutoReport('500:/calendar:other')).toBe(true);
	});
});
