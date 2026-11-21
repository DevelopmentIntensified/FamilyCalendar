/**
 * The `/admin/nlp` page body: the legacy heading and subtitle, feedback's
 * phrase tables grouped by source with the match sample and count, the export
 * panel on the page's own clock and zone, and one Resolve that goes through
 * the browser api client to `/api/admin/nlp/{id}/resolve`.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createFeedbackApi } from '$lib/domains/feedback';
import { createApiClient } from '$lib/kernel/client/apiClient';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import type { AdminPhraseRegisterData } from '../admin.contract';
import AdminPhraseRegister from './AdminPhraseRegister.svelte';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const ROW_AT = new Date('2026-11-01T09:00:00.000Z');

afterEach(cleanup);

function phraseData(overrides: Partial<AdminPhraseRegisterData> = {}): AdminPhraseRegisterData {
	return {
		open: [
			{
				id: 'phrase-1',
				source: 'event_parse',
				phrase: 'call mom',
				sample: 'call mom',
				matched: JSON.stringify({ title: 'Call mom' }),
				count: 3,
				resolved: false,
				createdAt: ROW_AT,
				updatedAt: ROW_AT
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

describe('AdminPhraseRegister', () => {
	it('renders the legacy page copy and the grouped phrase table', () => {
		render(AdminPhraseRegister, {
			props: { data: phraseData(), api: fakeApi([]), toasts: memoryToasts() }
		});
		expect(screen.getByRole('heading', { name: 'Unmatched Phrases' })).toBeInTheDocument();
		expect(
			screen.getByText(
				'Instructions the NLP/regex parsers could not handle. Add patterns for the frequent ones.'
			)
		).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: /Event parse \(1\)/ })).toBeInTheDocument();
		expect(screen.getByText('call mom')).toBeInTheDocument();
		expect(screen.getByText('title:')).toBeInTheDocument();
	});

	it('resolves a phrase through the api and clears the group', async () => {
		const paths: string[] = [];
		const toasts = memoryToasts();
		render(AdminPhraseRegister, {
			props: { data: phraseData(), api: fakeApi(paths), toasts }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

		await waitFor(() => expect(toasts.items).toEqual([{ kind: 'success', text: 'Resolved' }]));
		expect(paths).toEqual(['/api/admin/nlp/phrase-1/resolve']);
		// The open table is gone; the row itself stays visible under Resolved
		// (legacy nlp page 66a11131 lines 109-118 keep `phrase.phrase` there).
		expect(screen.queryByRole('heading', { name: /Event parse/ })).toBeNull();
		expect(screen.getByText(/Nothing unmatched/)).toBeInTheDocument();
		expect(screen.getByText(/Resolved \(1\)/)).toBeInTheDocument();
	});

	it('reveals the export text under the legacy textarea id', async () => {
		render(AdminPhraseRegister, {
			props: { data: phraseData(), api: fakeApi([]), toasts: memoryToasts() }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));
		const textarea = document.querySelector<HTMLTextAreaElement>('#phrase-export-text');
		if (!textarea) throw new Error('expected the phrase export textarea');
		expect(textarea.value).toContain('UNMATCHED PHRASES EXPORT');
		expect(textarea.value).toContain('call mom');
	});
});
