/**
 * Sheet behaviour a screen depends on: closed renders nothing, open shows the
 * title and children, Esc and the backdrop both ask to close, a click inside
 * does not, and focus returns to the trigger when the sheet goes away.
 *
 * Doc: src/lib/kernel/README.md
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Sheet from './Sheet.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>Sheet body</p>' }));

afterEach(cleanup);

// jsdom ships TouchEvent but no Touch constructor; the swipe handlers only read
// touches.length + touches[i].clientY, so plain fakes suffice (legacy test).
function touch(type: string, ys: number[]) {
	const event = new TouchEvent(type);
	Object.defineProperty(event, 'touches', { value: ys.map((clientY) => ({ clientY })) });
	return event;
}

describe('Sheet', () => {
	it('renders nothing when closed', () => {
		render(Sheet, { props: { open: false, onclose: vi.fn(), title: 'Settings', children } });
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.queryByText('Sheet body')).toBeNull();
	});

	it('shows the title and children while open', () => {
		render(Sheet, { props: { open: true, onclose: vi.fn(), title: 'Settings', children } });
		expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
		expect(screen.getByText('Sheet body')).toBeInTheDocument();
	});

	it('closes on Escape', async () => {
		const onclose = vi.fn();
		render(Sheet, { props: { open: true, onclose, title: 'Settings', children } });
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('closes on a backdrop click but not on a click inside the panel', async () => {
		const onclose = vi.fn();
		render(Sheet, { props: { open: true, onclose, title: 'Settings', children } });

		await fireEvent.click(screen.getByRole('dialog'));
		expect(onclose).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByTestId('sheet-backdrop'));
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('renders the footer snippet inside the panel', () => {
		const footer = createRawSnippet(() => ({ render: () => '<button type="button">Save</button>' }));
		render(Sheet, { props: { open: true, onclose: vi.fn(), title: 'Settings', children, footer } });
		expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
	});

	it('closes the bottom variant on a downward swipe past the threshold', async () => {
		const onclose = vi.fn();
		const { container } = render(Sheet, {
			props: { open: true, onclose, title: 'Day', variant: 'bottom', children }
		});
		const handle = container.querySelector<HTMLElement>('[data-drag-handle]');
		if (!handle) throw new Error('bottom sheet has no drag handle');

		handle.dispatchEvent(touch('touchstart', [100]));
		handle.dispatchEvent(touch('touchmove', [250]));
		handle.dispatchEvent(touch('touchend', []));

		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('renders no drag handle in the modal variant', () => {
		const { container } = render(Sheet, {
			props: { open: true, onclose: vi.fn(), title: 'Settings', children }
		});
		expect(container.querySelector('[data-drag-handle]')).toBeNull();
	});

	it('returns focus to the previously focused element when it goes away', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Open settings';
		document.body.appendChild(trigger);
		trigger.focus();

		const { unmount } = render(Sheet, {
			props: { open: true, onclose: vi.fn(), title: 'Settings', children }
		});
		const dialog = screen.getByRole('dialog');
		expect(dialog.contains(document.activeElement)).toBe(true);

		await unmount();
		expect(document.activeElement).toBe(trigger);
		trigger.remove();
	});
});
