import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import AccountFamiliesSection from './AccountFamiliesSection.svelte';

const families = [
	{
		id: 'f1',
		name: 'The Hoppers',
		role: 'creator',
		memberType: 'parent',
		memberCount: 4
	},
	{
		id: 'f2',
		name: "Grandma's lot",
		role: 'member',
		memberType: 'member',
		memberCount: 2
	}
];

describe('AccountFamiliesSection — 105: your families is a section', () => {
	afterEach(cleanup);

	it('lists every family the user belongs to, not just the first', () => {
		// 098 removed the first-membership guess; the count here has to be a real
		// one or the section is a decoration on top of the same bug.
		render(AccountFamiliesSection, { props: { families } });
		expect(screen.getByText('The Hoppers')).toBeTruthy();
		expect(screen.getByText("Grandma's lot")).toBeTruthy();
	});

	it('names the real roster size and the user’s own role', () => {
		render(AccountFamiliesSection, { props: { families } });
		const card = screen.getByText('The Hoppers').closest('a')!;
		const text = card.textContent?.replace(/\s+/g, ' ') ?? '';
		expect(text).toContain('4 members');
		expect(text).toContain('creator');
	});

	it('links into the family rather than leaving the reader to go and look', () => {
		render(AccountFamiliesSection, { props: { families } });
		expect(screen.getByText('The Hoppers').closest('a')!.getAttribute('href')).toBe('/family/f1');
	});

	it('offers creating a family from the same section', () => {
		render(AccountFamiliesSection, { props: { families } });
		expect(document.querySelector('a[href="/family/create"]')).toBeTruthy();
	});

	it('says plainly when the user belongs to no family yet', () => {
		render(AccountFamiliesSection, { props: { families: [] } });
		expect(screen.getByText(/belong to no families yet/i)).toBeTruthy();
	});
});
