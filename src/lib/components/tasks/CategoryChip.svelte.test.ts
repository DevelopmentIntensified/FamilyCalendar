import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import CategoryChip from './CategoryChip.svelte';

describe('CategoryChip (#280)', () => {
	afterEach(cleanup);

	it('renders the name with an accessible label', () => {
		render(CategoryChip, { props: { name: 'Deep Work' } });
		const chip = screen.getByTestId('category-chip');
		expect(chip.textContent?.trim()).toBe('Deep Work');
		expect(chip.getAttribute('title')).toBe('Category: Deep Work');
	});

	for (const name of [null, undefined, '', '   ']) {
		it(`renders nothing for ${JSON.stringify(name)}`, () => {
			render(CategoryChip, { props: { name } });
			expect(screen.queryByTestId('category-chip')).toBeNull();
		});
	}
});
