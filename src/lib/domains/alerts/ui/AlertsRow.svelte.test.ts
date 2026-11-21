/**
 * One Alert row: the unread wash, the real anchor, the shared label tables and
 * the plain-vs-modified click rule (modified clicks stay the browser's).
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { AlertRow } from '../alerts.contract';
import AlertsRow from './AlertsRow.svelte';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const ZONE = 'UTC';

afterEach(cleanup);

function row(over: Partial<AlertRow> = {}): AlertRow {
	return {
		id: 'n1',
		type: 'assignment_pending',
		rawType: 'assignment_pending',
		group: 'needs_you',
		actorName: 'Sarah',
		message: 'asked you to book the wall',
		link: '/calendar/tasks',
		readAt: null,
		createdAt: '2026-11-19 09:00:00+00',
		...over
	};
}

function renderRow(over: Partial<AlertRow> = {}) {
	const onopen = vi.fn();
	const target = row(over);
	render(AlertsRow, { props: { row: target, now: NOW, zone: ZONE, onopen } });
	return { onopen, target };
}

describe('AlertsRow', () => {
	it('is a real link to the deep link, with the actor, message and label', () => {
		renderRow();
		const link = screen.getByRole('link');
		expect(link).toHaveAttribute('href', '/calendar/tasks');
		expect(link).toHaveTextContent('Sarah');
		expect(link).toHaveTextContent('asked you to book the wall');
		expect(link).toHaveTextContent('Asked you');
	});

	it('names an unrecognised type Update and never echoes the column', () => {
		renderRow({ type: null, rawType: 'mystery_type', message: 'did something new' });
		expect(screen.getByText('Update')).toBeInTheDocument();
		expect(screen.queryByText('mystery_type')).not.toBeInTheDocument();
	});

	it('washes an unread row, and only an unread row', () => {
		renderRow({ id: 'unread-1' });
		const unread = screen.getByRole('link').closest('li');
		expect(unread?.getAttribute('data-unread')).toBe('true');
		expect(unread?.className).toContain('from-primary-50');
		cleanup();

		renderRow({ id: 'read-1', readAt: '2026-11-20 10:00:00+00' });
		const read = screen.getByRole('link').closest('li');
		expect(read?.getAttribute('data-unread')).toBe('false');
		expect(read?.className).not.toContain('from-primary-50');
	});

	it('opens a row on a plain left click', async () => {
		const { onopen, target } = renderRow();
		await fireEvent.click(screen.getByRole('link'));
		expect(onopen).toHaveBeenCalledWith(target);
	});

	it('leaves a modified click to the browser so open-in-new-tab still opens', () => {
		const { onopen } = renderRow();
		fireEvent.click(screen.getByRole('link'), { metaKey: true });
		expect(onopen).not.toHaveBeenCalled();
	});

	it('renders a button when the Alert has no link', async () => {
		const { onopen, target } = renderRow({ link: null, message: 'did something new' });
		const trigger = screen.getByRole('button', { name: /did something new/ });
		await fireEvent.click(trigger);
		expect(onopen).toHaveBeenCalledWith(target);
	});
});
