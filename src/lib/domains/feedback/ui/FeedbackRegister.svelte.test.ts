/**
 * One admin register as the admin sees it, for both kinds: open bug cards with
 * the area chip, reporter and page link; open phrase tables grouped by source
 * with the match sample and count; the collapsible Resolved list; the empty
 * states; and one Resolve button that reports its row.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { BugReportWithReporter, UnmatchedPhraseView } from '../feedback.contract';
import FeedbackRegister from './FeedbackRegister.svelte';

const ROW_AT = new Date('2026-11-01T09:00:00.000Z');

afterEach(cleanup);

function bugRow(
	id: string,
	overrides: Partial<BugReportWithReporter> = {}
): BugReportWithReporter {
	return {
		id,
		userId: null,
		area: 'tasks',
		description: `report ${id}`,
		url: null,
		status: 'open',
		resolvedAt: null,
		createdAt: ROW_AT,
		updatedAt: ROW_AT,
		reporterFirstName: null,
		reporterLastName: null,
		...overrides
	};
}

function phraseRow(
	id: string,
	overrides: Partial<UnmatchedPhraseView> = {}
): UnmatchedPhraseView {
	return {
		id,
		source: 'event_parse',
		phrase: `phrase ${id}`,
		sample: `phrase ${id}`,
		matched: null,
		count: 1,
		resolved: false,
		createdAt: ROW_AT,
		updatedAt: ROW_AT,
		...overrides
	};
}

function captureResolve(): { onresolve: (id: string) => void; calls: string[] } {
	const calls: string[] = [];
	return { calls, onresolve: (id) => void calls.push(id) };
}

describe('FeedbackRegister — bugs', () => {
	it('renders an open report card with the area chip, reporter and page link', () => {
		const { onresolve } = captureResolve();
		render(FeedbackRegister, {
			props: {
				kind: 'bug',
				open: [
					bugRow('a', {
						area: 'account',
						description: 'Save button does nothing',
						url: '/account',
						reporterFirstName: 'Mia',
						reporterLastName: 'Ng'
					})
				],
				resolved: [],
				onresolve
			}
		});

		expect(screen.getByText('Account')).toBeInTheDocument();
		expect(screen.getByText('Save button does nothing')).toBeInTheDocument();
		expect(screen.getByText(/Reported by Mia Ng/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: '/account' })).toHaveAttribute('href', '/account');
	});

	it('resolves the row the button belongs to', async () => {
		const { calls, onresolve } = captureResolve();
		render(FeedbackRegister, {
			props: { kind: 'bug', open: [bugRow('a'), bugRow('b')], resolved: [], onresolve }
		});

		await fireEvent.click(screen.getAllByTestId('resolve-feedback')[1]!);

		expect(calls).toEqual(['b']);
	});

	it('says "Anonymous / deleted" for a reporter with no names', () => {
		const { onresolve } = captureResolve();
		render(FeedbackRegister, {
			props: { kind: 'bug', open: [bugRow('a')], resolved: [], onresolve }
		});
		expect(screen.getByText(/Reported by Anonymous \/ deleted/)).toBeInTheDocument();
	});

	it('shows the empty register and the resolved list', () => {
		const { onresolve } = captureResolve();
		render(FeedbackRegister, {
			props: {
				kind: 'bug',
				open: [],
				resolved: [bugRow('c', { description: 'closed report', status: 'resolved' })],
				onresolve
			}
		});

		expect(screen.getByText('No open bug reports. 🎉')).toBeInTheDocument();
		expect(screen.getByText('Resolved (1)')).toBeInTheDocument();
		expect(screen.getByText('Tasks: closed report')).toBeInTheDocument();
	});

	it('shows the pending row as resolving and leaves the others enabled', () => {
		const { onresolve } = captureResolve();
		render(FeedbackRegister, {
			props: {
				kind: 'bug',
				open: [bugRow('a'), bugRow('b')],
				resolved: [],
				pendingId: 'a',
				onresolve
			}
		});

		expect(screen.getByRole('button', { name: 'Resolving…' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Resolve' })).not.toBeDisabled();
	});
});

describe('FeedbackRegister — phrases', () => {
	it('groups open phrases by source into tables with the match sample', () => {
		const { onresolve } = captureResolve();
		render(FeedbackRegister, {
			props: {
				kind: 'phrase',
				open: [
					phraseRow('p1', {
						phrase: 'call mom',
						count: 3,
						matched: '{"title":"Call mom","when":null}'
					}),
					phraseRow('p2', { source: 'bulk_edit', phrase: 'dinner at six' })
				],
				resolved: [],
				onresolve
			}
		});

		expect(screen.getByRole('heading', { name: /Event parse/ })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: /Bulk edit/ })).toBeInTheDocument();
		expect(screen.getByText('call mom')).toBeInTheDocument();
		expect(screen.getByText('dinner at six')).toBeInTheDocument();
		expect(screen.getByText(/Call mom/)).toBeInTheDocument();
		// One table per source (legacy), so the header repeats: Event parse, Bulk edit.
		expect(screen.getAllByRole('columnheader', { name: 'First seen' })).toHaveLength(2);
	});

	it('resolves the phrase row the button belongs to', async () => {
		const { calls, onresolve } = captureResolve();
		render(FeedbackRegister, {
			props: {
				kind: 'phrase',
				open: [phraseRow('p1'), phraseRow('p2')],
				resolved: [],
				onresolve
			}
		});

		await fireEvent.click(screen.getAllByTestId('resolve-feedback')[0]!);

		expect(calls).toEqual(['p1']);
	});

	it('says nothing is unmatched, and lists the resolved phrases', () => {
		const { onresolve } = captureResolve();
		render(FeedbackRegister, {
			props: {
				kind: 'phrase',
				open: [],
				resolved: [phraseRow('p3', { phrase: 'old phrase', count: 4, resolved: true })],
				onresolve
			}
		});

		expect(screen.getByText('Nothing unmatched. Parsers are holding up.')).toBeInTheDocument();
		expect(screen.getByText('Resolved (1)')).toBeInTheDocument();
		expect(screen.getByText('old phrase')).toBeInTheDocument();
		expect(screen.getByText('×4')).toBeInTheDocument();
	});
});
