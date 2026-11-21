/**
 * The admin frame as the admin sees it: the "🛠 Admin" home link, the two
 * section tabs in legacy order with their count badges, the active tab on its
 * exact path or a child path (never on `/admin` itself), "← Back to app" →
 * `/calendar`, the page body, the `0` fallback for missing counts, and the
 * single Notifications region.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import AdminShell from './AdminShell.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>Page body</p>' }));

afterEach(cleanup);

function renderShell(
	pathname: string,
	counts: { openBugs?: number; openPhrases?: number } = {}
): void {
	render(AdminShell, { props: { pathname, ...counts, children } });
}

/** A tab's visible text with the badge split off, for the nav-order assertion. */
function tabText(link: HTMLElement): string {
	return (link.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('AdminShell', () => {
	it('renders the legacy header, both tabs in order and the way back', () => {
		renderShell('/admin', { openBugs: 2, openPhrases: 5 });

		const home = screen.getByRole('link', { name: 'Admin home' });
		expect(home).toHaveAttribute('href', '/admin');
		expect(home).toHaveTextContent('🛠 Admin');

		const nav = screen.getByRole('navigation', { name: 'Admin sections' });
		expect(within(nav).getAllByRole('link').map(tabText)).toEqual([
			'Bug Reports 2',
			'Unmatched Phrases 5'
		]);

		expect(screen.getByRole('link', { name: '← Back to app' })).toHaveAttribute(
			'href',
			'/calendar'
		);
		expect(screen.getByText('Page body')).toBeInTheDocument();
		expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
	});

	it('marks a tab active on its exact path and on a child path, but not on the index', () => {
		for (const pathname of ['/admin/bugs', '/admin/bugs/42']) {
			cleanup();
			renderShell(pathname);
			expect(screen.getByRole('link', { name: /Bug Reports/ })).toHaveAttribute(
				'aria-current',
				'page'
			);
			expect(screen.getByRole('link', { name: /Unmatched Phrases/ })).not.toHaveAttribute(
				'aria-current'
			);
		}
		cleanup();
		renderShell('/admin');
		expect(screen.getByRole('link', { name: /Bug Reports/ })).not.toHaveAttribute('aria-current');
		expect(screen.getByRole('link', { name: /Unmatched Phrases/ })).not.toHaveAttribute(
			'aria-current'
		);
	});

	it('renders 0 for both badges when the layout data omits the counts', () => {
		renderShell('/admin');
		const nav = screen.getByRole('navigation', { name: 'Admin sections' });
		expect(within(nav).getAllByRole('link').map(tabText)).toEqual([
			'Bug Reports 0',
			'Unmatched Phrases 0'
		]);
	});
});
