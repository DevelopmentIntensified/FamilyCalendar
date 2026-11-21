/**
 * The shell: the skip link, the page fade's slot (the nav and the toaster come
 * in as snippets until shell ports them), and the footer's three links and the
 * year it was handed. The share tags the shell emits are the SEO table's own
 * (`marketing.seo.rules.test.ts`) and are checked visually against the legacy
 * baseline, which is what the sheet records.
 *
 * Doc: ../README.md#invariants
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import MarketingShell from './MarketingShell.svelte';

afterEach(cleanup);

const data = { origin: 'http://localhost', pathname: '/features', year: 2026 };

function snippet(html: string) {
	return createRawSnippet(() => ({ render: () => html }));
}

describe('MarketingShell', () => {
	it('renders the navbar snippet above the page and the page itself', () => {
		render(MarketingShell, {
			props: { data, nav: snippet('<nav>navbar</nav>'), children: snippet('<p>page body</p>') }
		});

		expect(screen.getByText('navbar')).toBeInTheDocument();
		expect(screen.getByText('page body')).toBeInTheDocument();
	});

	it('starts every page with a skip link to #main', () => {
		render(MarketingShell, { props: { data, children: snippet('<p>page body</p>') } });

		const skip = screen.getByText('Skip to content');
		expect(skip.getAttribute('href')).toBe('#main');
		expect(document.querySelector('main')?.id).toBe('main');
	});

	it('renders the toaster snippet only when it is handed in', () => {
		render(MarketingShell, {
			props: { data, toaster: snippet('<div>toasts</div>'), children: snippet('<p>x</p>') }
		});

		expect(screen.getByText('toasts')).toBeInTheDocument();
	});

	it('prints the footer links and the year from the load', () => {
		render(MarketingShell, { props: { data, children: snippet('<p>x</p>') } });

		expect(screen.getByText('Changelog').getAttribute('href')).toBe('/changelog');
		expect(screen.getByText('Roadmap').getAttribute('href')).toBe('/roadmap');
		expect(screen.getByText('Android app').getAttribute('href')).toBe('/android');
		expect(document.body.textContent).toMatch(/©\s*2026 FamilyPlanz\. All rights reserved\./);
	});
});
