/**
 * The `/admin` index as the admin sees it: heading "Admin", the legacy
 * subtitle, and the two cards with their emoji, copy, `N open` badges and
 * hrefs, plus the `0` fallback when the layout data omits the counts.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import AdminHome from './AdminHome.svelte';

afterEach(cleanup);

function cardText(link: HTMLElement): string {
	return (link.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('AdminHome', () => {
	it('renders the legacy heading, subtitle and both cards with their open counts', () => {
		render(AdminHome, { props: { openBugs: 3, openPhrases: 7 } });

		expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
		expect(screen.getByText('Triage user feedback and parser gaps.')).toBeInTheDocument();

		const bugs = screen.getByRole('link', { name: /Bug Reports/ });
		expect(bugs).toHaveAttribute('href', '/admin/bugs');
		expect(cardText(bugs)).toBe(
			"🐞 Bug Reports 3 open User-submitted reports, newest first. Resolve what's fixed."
		);

		const phrases = screen.getByRole('link', { name: /Unmatched Phrases/ });
		expect(phrases).toHaveAttribute('href', '/admin/nlp');
		expect(cardText(phrases)).toBe(
			"💬 Unmatched Phrases 7 open Instructions the parsers couldn't handle. Add patterns for frequent ones."
		);
	});

	it('renders 0 open on both cards when the layout data omits the counts', () => {
		render(AdminHome);
		expect(cardText(screen.getByRole('link', { name: /Bug Reports/ }))).toContain('0 open');
		expect(cardText(screen.getByRole('link', { name: /Unmatched Phrases/ }))).toContain('0 open');
	});
});
