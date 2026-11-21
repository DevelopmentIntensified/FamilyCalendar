/**
 * The error card: 404 / 4xx / 5xx copy, the status line and title, and the
 * issue-261 split — only a 5xx promises a notification and links the bug form.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import ShellErrorView from './ShellErrorView.svelte';

afterEach(cleanup);

describe('ShellErrorView', () => {
	it('keeps the notified copy and report CTA for 5xx only', () => {
		render(ShellErrorView, {
			props: { status: 500, pathname: '/calendar/tasks', search: '?day=1' }
		});
		expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
		expect(screen.getByText(/We've been notified automatically/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Add details to the report' })).toHaveAttribute(
			'href',
			'/report-bug?from=%2Fcalendar%2Ftasks%3Fday%3D1'
		);
		expect(screen.getByText('Error 500')).toBeInTheDocument();
	});

	it('shows the reason for a 4xx and does not claim we were notified', () => {
		render(ShellErrorView, {
			props: { status: 403, message: 'Only the family creator can do that.', pathname: '/family' }
		});
		expect(screen.getByRole('heading', { name: "We can't open that" })).toBeInTheDocument();
		expect(screen.getByText('Only the family creator can do that.')).toBeInTheDocument();
		expect(screen.queryByText(/We've been notified/)).toBeNull();
		expect(screen.queryByRole('link', { name: 'Add details to the report' })).toBeNull();
	});

	it('uses the 404 copy and keeps the way back', () => {
		render(ShellErrorView, { props: { status: 404, pathname: '/nope' } });
		expect(screen.getByRole('heading', { name: "We can't find that page" })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Back to calendar' })).toHaveAttribute(
			'href',
			'/calendar'
		);
		expect(screen.getByText('Error 404')).toBeInTheDocument();
	});
});
