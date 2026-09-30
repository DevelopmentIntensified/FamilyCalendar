import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import DashboardInfoBand from './DashboardInfoBand.svelte';

afterEach(() => {
	cleanup();
});

const verse = {
	reference: 'Psalm 127:1',
	text: 'Except the LORD build the house, they labour in vain.',
	attribution: 'ESV'
};

describe('DashboardInfoBand — a reading, not a task', () => {
	it('renders the verse text and its reference', () => {
		render(DashboardInfoBand, { props: { dailyVerse: verse } });
		expect(screen.getByText(verse.text)).toBeInTheDocument();
		expect(screen.getByTestId('dashboard-info-band').textContent).toContain('Psalm 127:1');
	});

	it('carries no card chrome and no heading — it is not a band card', () => {
		render(DashboardInfoBand, { props: { dailyVerse: verse } });
		const band = screen.getByTestId('dashboard-info-band');
		expect(band.className).not.toContain('shadow-sm');
		expect(band.querySelector('h1, h2, h3')).toBeNull();
	});

	it('renders nothing at all when there is no verse', () => {
		render(DashboardInfoBand, { props: { dailyVerse: null } });
		expect(screen.queryByTestId('dashboard-info-band')).toBeNull();
	});

	it('renders nothing when the component is given no props', () => {
		render(DashboardInfoBand, {});
		expect(screen.queryByTestId('dashboard-info-band')).toBeNull();
	});

	it('names the attribution when the translation supplies one, and omits it when not', async () => {
		const { rerender } = render(DashboardInfoBand, { props: { dailyVerse: verse } });
		expect(screen.getByTestId('dashboard-info-band').textContent).toContain('ESV');
		await rerender({ dailyVerse: { reference: 'Psalm 127:1', text: verse.text } });
		expect(screen.getByTestId('dashboard-info-band').textContent).not.toContain('ESV');
	});

	it('wraps instead of overflowing at 320px', () => {
		render(DashboardInfoBand, {
			props: {
				dailyVerse: {
					reference: 'A very long book chapter and verse reference that keeps going',
					text: 'A verse far longer than any single line on a three hundred and twenty pixel wide screen could ever hope to hold without wrapping somewhere along the way.'
				}
			}
		});
		const band = screen.getByTestId('dashboard-info-band');
		expect(band.className).toContain('flex-col');
		expect(band.querySelector('p')?.className).toContain('break-words');
	});
});
