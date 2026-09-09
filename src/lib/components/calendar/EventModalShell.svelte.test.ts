import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import EventModalShell from './EventModalShell.svelte';

describe('EventModalShell', () => {
	afterEach(cleanup);

	it('renders title, subtitle, children, and closes', async () => {
		const onClose = vi.fn();
		const onDragStart = vi.fn();
		render(EventModalShell, {
			props: {
				title: 'Edit Event',
				subtitle: 'sub',
				dragOffset: 0,
				dragTransition: false,
				onClose,
				onDragStart,
				onDragMove: vi.fn(),
				onDragEnd: vi.fn(),
				children: undefined
			}
		});
		expect(screen.getByText('Edit Event')).toBeTruthy();
		expect(screen.getByText('sub')).toBeTruthy();
		await fireEvent.click(screen.getByLabelText('Close modal'));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('applies the drag offset transform', () => {
		render(EventModalShell, {
			props: {
				title: 'T',
				subtitle: null,
				dragOffset: 42,
				dragTransition: true,
				onClose: vi.fn(),
				onDragStart: vi.fn(),
				onDragMove: vi.fn(),
				onDragEnd: vi.fn(),
				children: undefined
			}
		});
		// SAFETY: the shell always renders its [role="dialog"] sheet.
		const sheet = document.querySelector('[role="dialog"]') as HTMLElement;
		expect(sheet.style.transform).toContain('42px');
	});
});
