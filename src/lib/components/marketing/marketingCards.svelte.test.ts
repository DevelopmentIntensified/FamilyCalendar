import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import FeatureCard from './FeatureCard.svelte';
import MomentCard from './MomentCard.svelte';
import GalleryCard from './GalleryCard.svelte';
import TestimonialCard from './TestimonialCard.svelte';
import StrugglePanel from './StrugglePanel.svelte';

afterEach(cleanup);

describe('marketing cards', () => {
	it('FeatureCard renders icon + title + blurb', () => {
		render(FeatureCard, {
			props: { icon: 'calendar', title: 'Shared Family Calendar', blurb: 'One place.' }
		});
		expect(screen.getByRole('heading', { name: 'Shared Family Calendar' })).toBeInTheDocument();
		expect(screen.getByText('One place.')).toBeInTheDocument();
	});

	it('MomentCard renders title + blurb', () => {
		render(MomentCard, {
			props: {
				icon: 'clock',
				gradient: 'from-[#FED5CF] to-[#F1B598]/50',
				glow: 'bg-[#F1B598]/30',
				title: 'Morning routines',
				blurb: 'See it all.'
			}
		});
		expect(screen.getByRole('heading', { name: 'Morning routines' })).toBeInTheDocument();
	});

	it('GalleryCard renders image alt + caption', () => {
		render(GalleryCard, {
			props: { img: 'https://x/y.jpg', alt: 'Mother and son', title: 'Growing', blurb: 'Grows.' }
		});
		expect(screen.getByAltText('Mother and son')).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Growing' })).toBeInTheDocument();
	});

	it('TestimonialCard renders five stars + quote + author', () => {
		const { container } = render(TestimonialCard, {
			props: {
				accent: 'border-[#FED5CF] bg-[#FED5CF]/20',
				star: 'text-[#F1B598]',
				avatar: 'from-[#FED5CF] to-[#F1B598]',
				quote: 'Stopped the pickup texts.',
				initial: 'S',
				name: 'Sarah M.',
				detail: 'Mom of 3'
			}
		});
		expect(container.querySelectorAll('svg').length).toBe(5);
		expect(screen.getByText(/Stopped the pickup texts/)).toBeInTheDocument();
		expect(screen.getByText('Sarah M.')).toBeInTheDocument();
	});

	it('StrugglePanel marks before/after items', () => {
		const { unmount } = render(StrugglePanel, {
			props: { tone: 'before', title: 'Before', items: ['Pickup texts'] }
		});
		expect(screen.getByText('✕')).toBeInTheDocument();
		unmount();
		render(StrugglePanel, { props: { tone: 'after', title: 'After', items: ['One calendar'] } });
		expect(screen.getByText('✓')).toBeInTheDocument();
	});
});
