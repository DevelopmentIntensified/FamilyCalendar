import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiError, type AutoReportFiler } from './apiError';
import { __resetAutoReportThrottle } from '$lib/server/services/autoBugReport';
import type { NewBugReport } from '$lib/server/db/actions/bugReports';

/** Spied filer injected through apiError's seam — no module mocking, no DB. */
const fileReport = vi.fn<(report: NewBugReport) => Promise<null>>(async () => null);

function apiErrorWithSpy(path: string, status: number, message: string, userId: string | null) {
	return apiError(path, status, message, userId, fileReport satisfies AutoReportFiler);
}

describe('apiError', () => {
	beforeEach(() => {
		__resetAutoReportThrottle();
		fileReport.mockClear();
	});

	it('returns the message with the given status', async () => {
		const res = apiErrorWithSpy('/api/events', 500, 'Failed to create event', 'u1');
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: 'Failed to create event' });
	});

	it('auto-files 500s with the path area', () => {
		apiErrorWithSpy('/api/events', 500, 'Failed to create event', 'u1');
		expect(fileReport).toHaveBeenCalledTimes(1);
		expect(fileReport).toHaveBeenCalledWith(
			expect.objectContaining({ area: 'calendar', userId: 'u1' })
		);
	});

	it('never files 4xx client errors', () => {
		const res = apiErrorWithSpy('/api/events', 400, 'Bad input', 'u1');
		expect(res.status).toBe(400);
		expect(fileReport).not.toHaveBeenCalled();
	});

	it('still responds when filing throws', async () => {
		fileReport.mockRejectedValueOnce(new Error('db down'));
		const res = apiErrorWithSpy('/api/tasks', 500, 'boom', null);
		expect(res.status).toBe(500);
	});
});
