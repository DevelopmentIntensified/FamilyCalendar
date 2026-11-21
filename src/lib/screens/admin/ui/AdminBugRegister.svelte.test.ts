/**
 * The `/admin/bugs` page body: the legacy heading and subtitle, feedback's
 * register with its open cards and empty state, the "Export for agent" panel
 * on the page's own clock and zone, and one Resolve that goes through the
 * browser api client to `/api/admin/bugs/{id}/resolve` and moves the row in
 * both the register and the export text (issue 262).
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createFeedbackApi } from '$lib/domains/feedback';
import { createApiClient } from '$lib/kernel/client/apiClient';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import type { AdminBugRegisterData } from '../admin.contract';
import AdminBugRegister from './AdminBugRegister.svelte';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const ROW_AT = new Date('2026-11-01T09:00:00.000Z');

afterEach(cleanup);

function bugData(overrides: Partial<AdminBugRegisterData> = {}): AdminBugRegisterData {
	return {
		open: [
			{
				id: 'bug-1',
				userId: null,
				area: 'tasks',
				description: 'Save button does nothing',
				url: null,
				status: 'open',
				resolvedAt: null,
				createdAt: ROW_AT,
				updatedAt: ROW_AT,
				reporterFirstName: 'Ada',
				reporterLastName: 'Lovelace'
			}
		],
		resolved: [],
		now: NOW,
		zone: 'UTC',
		...overrides
	};
}

/** The real api client over a fake transport, so the route path is what is asserted. */
function fakeApi(paths: string[]) {
	return createFeedbackApi(
		createApiClient(async (path) => {
			paths.push(path);
			return new Response('{}', { status: 200 });
		})
	);
}

describe('AdminBugRegister', () => {
	it('renders the legacy page copy and the empty register', () => {
		render(AdminBugRegister, {
			props: { data: bugData({ open: [] }), api: fakeApi([]), toasts: memoryToasts() }
		});
		expect(screen.getByRole('heading', { name: 'Bug Reports' })).toBeInTheDocument();
		expect(screen.getByText('User-submitted bug reports, newest first.')).toBeInTheDocument();
		expect(screen.getByText('No open bug reports. 🎉')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Export for agent' })).toBeInTheDocument();
	});

	it('resolves a report through the api and moves it out of the open list and the export', async () => {
		const paths: string[] = [];
		const toasts = memoryToasts();
		render(AdminBugRegister, {
			props: { data: bugData(), api: fakeApi(paths), toasts }
		});

		expect(screen.getByText('Save button does nothing')).toBeInTheDocument();
		expect(screen.getByText('Tasks')).toBeInTheDocument();
		expect(screen.getByText(/Reported by Ada Lovelace/)).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

		await waitFor(() => expect(toasts.items).toEqual([{ kind: 'success', text: 'Resolved' }]));
		expect(paths).toEqual(['/api/admin/bugs/bug-1/resolve']);
		expect(screen.queryByText('Save button does nothing')).toBeNull();
		expect(screen.getByText(/Resolved \(1\)/)).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));
		const textarea = document.querySelector<HTMLTextAreaElement>('#bug-export-text');
		if (!textarea) throw new Error('expected the bug export textarea');
		expect(textarea.value).toContain('BUG REPORTS EXPORT');
		expect(textarea.value).not.toContain('Save button does nothing');
	});
});
