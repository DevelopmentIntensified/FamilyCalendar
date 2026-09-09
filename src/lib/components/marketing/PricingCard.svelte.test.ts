import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import PricingCard from './PricingCard.svelte';

const base = {
	name: 'Family',
	blurb: 'For families who want it all',
	price: '$9',
	per: '/month',
	features: ['Everything in Free', 'Unlimited calendars'],
	ctaLabel: 'Start Free Trial'
};

afterEach(cleanup);

describe('PricingCard', () => {
	it('renders name, price, features, and CTA', () => {
		render(PricingCard, { props: base });
		expect(screen.getByRole('heading', { name: 'Family' })).toBeInTheDocument();
		expect(screen.getByText('$9')).toBeInTheDocument();
		expect(screen.getByText('Unlimited calendars')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Start Free Trial' })).toHaveAttribute(
			'href',
			'/signup'
		);
	});

	it('shows the badge and note when provided', () => {
		render(PricingCard, {
			props: { ...base, badge: 'Most Popular', note: 'Less than $1/month', accent: 'amber' }
		});
		expect(screen.getByText('Most Popular')).toBeInTheDocument();
		expect(screen.getByText('Less than $1/month')).toBeInTheDocument();
	});

	it('omits badge and note slots for the plain tier', () => {
		const { container } = render(PricingCard, { props: base });
		expect(container.textContent).not.toContain('Most Popular');
	});
});
