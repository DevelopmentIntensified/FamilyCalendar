import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiError } from './apiError';
import { createBugReport } from '$lib/server/db/actions/bugReports';
import { __resetAutoReportThrottle } from '$lib/server/services/autoBugReport';

vi.mock('$lib/server/db/actions/bugReports', () => ({
	createBugReport: vi.fn(async () => null)
}));

describe('apiError', () => {
	beforeEach(() => {
		__resetAutoReportThrottle();
		vi.mocked(createBugReport).mockClear();
	});

	it('returns the message with the given status', async () => {
		const res = apiError('/api/events', 500, 'Failed to create event', 'u1');
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: 'Failed to create event' });
	});

	it('auto-files 500s with the path area', () => {
		apiError('/api/events', 500, 'Failed to create event', 'u1');
		expect(createBugReport).toHaveBeenCalledTimes(1);
		expect(createBugReport).toHaveBeenCalledWith(
			expect.objectContaining({ area: 'calendar', userId: 'u1' })
		);
	});

	it('never files 4xx client errors', () => {
		const res = apiError('/api/events', 400, 'Bad input', 'u1');
		expect(res.status).toBe(400);
		expect(createBugReport).not.toHaveBeenCalled();
	});

	it('still responds when filing throws', () => {
		vi.mocked(createBugReport).mockRejectedValueOnce(new Error('db down'));
		const res = apiError('/api/tasks', 500, 'boom', null);
		expect(res.status).toBe(500);
	});
});
