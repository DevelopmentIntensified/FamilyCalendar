import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach, vi } from 'vitest';
import FirstRunCard from './FirstRunCard.svelte';

describe('FirstRunCard', () => {
	afterEach(cleanup);

	it('links to smart tasks', () => {
		render(FirstRunCard, { props: { onDismiss: vi.fn() } });
		expect(screen.getByText('Blank calendar!')).toBeTruthy();
		const link = screen.getByText('Browse ✨ Smart tasks');
		expect(link.getAttribute('href')).toBe('/calendar/tasks');
	});

	it('fires dismiss', async () => {
		const onDismiss = vi.fn();
		render(FirstRunCard, { props: { onDismiss } });
		await fireEvent.click(screen.getByLabelText('Dismiss'));
		expect(onDismiss).toHaveBeenCalledOnce();
	});
});
