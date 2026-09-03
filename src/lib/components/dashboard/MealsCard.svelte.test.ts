import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import MealsCard from './MealsCard.svelte';

afterEach(() => {
	cleanup();
});

describe('MealsCard kind-aware placeholder', () => {
	it('follows the selected meal kind', async () => {
		render(MealsCard, { props: { meals: [], dateKey: '2026-09-03' } });
		const select = screen.getByLabelText('Meal kind');
		await fireEvent.change(select, { target: { value: 'lunch' } });
		expect(await screen.findByPlaceholderText("What's for lunch?")).toBeInTheDocument();
	});
});
