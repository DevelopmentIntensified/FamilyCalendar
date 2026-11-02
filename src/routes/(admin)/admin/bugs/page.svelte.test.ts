import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import BugsPage from './+page.svelte';
import NlpPage from '../nlp/+page.svelte';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/forms is framework-injected; no DI seam exists.
vi.mock('$app/forms', () => ({ enhance: vi.fn(() => ({ destroy: () => {} })) }));

afterEach(cleanup);

function bug(id: string, description: string) {
	return {
		id,
		userId: 'u1',
		area: 'tasks',
		description,
		url: '/calendar/tasks',
		createdAt: new Date('2026-11-01T10:00:00Z'),
		resolvedAt: null,
		reporterFirstName: 'Sam',
		reporterLastName: null,
		reporterEmail: 'sam@example.com'
	};
}

function phrase(id: string, text: string) {
	return {
		id,
		source: 'event_parse',
		phrase: text,
		sample: text,
		matched: null,
		count: 1,
		resolved: false,
		createdAt: new Date('2026-11-01T10:00:00Z'),
		updatedAt: new Date('2026-11-01T10:00:00Z')
	};
}

async function exportBox(): Promise<HTMLTextAreaElement> {
	if (!screen.queryByRole('textbox'))
		await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));
	return (await screen.findByRole('textbox')) as HTMLTextAreaElement;
}

// Issue 262: exportText was computed once, so resolved rows stayed in the
// export after `use:enhance` refreshed `data`.
describe('admin export follows refreshed data', () => {
	it('bugs: drops resolved reports from the export', async () => {
		const { rerender } = render(BugsPage, {
			props: {
				data: { open: [bug('a', 'ALPHA bug'), bug('b', 'BETA bug')], resolved: [] } as never
			}
		});
		expect((await exportBox()).value).toContain('BETA bug');
		await rerender({ data: { open: [bug('a', 'ALPHA bug')], resolved: [] } as never });
		const box = await exportBox();
		expect(box.value).toContain('ALPHA bug');
		expect(box.value).not.toContain('BETA bug');
	});

	it('nlp: drops resolved phrases from the export', async () => {
		const { rerender } = render(NlpPage, {
			props: {
				data: {
					phrases: [phrase('a', 'ALPHA phrase'), phrase('b', 'BETA phrase')],
					resolved: []
				} as never
			}
		});
		expect((await exportBox()).value).toContain('BETA phrase');
		await rerender({ data: { phrases: [phrase('a', 'ALPHA phrase')], resolved: [] } as never });
		expect((await exportBox()).value).not.toContain('BETA phrase');
	});
});
