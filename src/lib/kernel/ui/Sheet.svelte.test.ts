/**
 * Sheet behaviour a screen depends on: closed renders nothing, open shows the
 * title (and optional subtitle) and children, Esc and the backdrop both ask to
 * close, a click inside does not, the bottom variant swipes down to close
 * (unless `swipeToClose` is false), and focus returns to the trigger when the
 * sheet goes away.
 *
 * Esc belongs to the innermost handler: a child that already called
 * `preventDefault()` (a ConfirmAction ask) keeps the sheet open. Test ids are
 * derived from the sheet's own (`sheet`, `sheet-close`, `sheet-backdrop`), so
 * two sheets on one page never answer to the same id.
 *
 * Doc: src/lib/kernel/README.md
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import Sheet from './Sheet.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>Sheet body</p>' }));

afterEach(cleanup);

// jsdom ships TouchEvent but no Touch constructor; the swipe handlers only read
// touches.length + touches[i].clientY, so plain fakes suffice (legacy test).
// The events must bubble: Svelte 5 delegates touchstart/touchmove/touchend to
// the component root (svelte/src/utils.js DELEGATED_EVENTS), so a non-bubbling
// event dispatched on the handle never reaches the handler.
function touch(type: string, ys: number[]) {
	const event = new TouchEvent(type, { bubbles: true });
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

	it('renders the legacy subtitle line under the title', () => {
		render(Sheet, {
			props: {
				open: true,
				onclose: vi.fn(),
				title: 'Edit event',
				subtitle: 'Tue 11 Nov · 09:00',
				children
			}
		});
		const subtitle = screen.getByText('Tue 11 Nov · 09:00');
		expect(subtitle.tagName).toBe('P');
		expect(subtitle).toHaveClass('mt-0.5', 'text-xs', 'text-primary-100');
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

	it('does not start a swipe-to-close when swipeToClose is false', async () => {
		const onclose = vi.fn();
		const { container } = render(Sheet, {
			props: {
				open: true,
				onclose,
				title: 'Day',
				variant: 'bottom',
				swipeToClose: false,
				children
			}
		});
		const handle = container.querySelector<HTMLElement>('[data-drag-handle]');
		if (!handle) throw new Error('bottom sheet has no drag handle');

		handle.dispatchEvent(touch('touchstart', [100]));
		handle.dispatchEvent(touch('touchmove', [250]));
		handle.dispatchEvent(touch('touchend', []));

		expect(onclose).not.toHaveBeenCalled();
	});

	it('renders no drag handle in the modal variant', () => {
		const { container } = render(Sheet, {
			props: { open: true, onclose: vi.fn(), title: 'Settings', children }
		});
		expect(container.querySelector('[data-drag-handle]')).toBeNull();
	});

	it('names the dialog and the close button from the caller’s testid', () => {
		render(Sheet, {
			props: { open: true, onclose: vi.fn(), title: 'Settings', testid: 'settings-sheet', children }
		});
		expect(screen.getByTestId('settings-sheet')).toBe(screen.getByRole('dialog'));
		expect(screen.getByTestId('settings-sheet-close')).toHaveAccessibleName('Close modal');
	});

	it('returns focus to the previously focused element when it closes', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Open settings';
		document.body.appendChild(trigger);
		trigger.focus();

		// The parent owns `open`: closing is a prop change, not an unmount.
		const onclose = vi.fn();
		const { rerender } = render(Sheet, {
			props: { open: true, onclose, title: 'Settings', children }
		});
		const dialog = screen.getByRole('dialog');
		expect(dialog.contains(document.activeElement)).toBe(true);

		await rerender({ open: false, onclose, title: 'Settings', children });
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(document.activeElement).toBe(trigger);
		trigger.remove();
	});

	it('names the dialog, close button and backdrop from a default test id', () => {
		render(Sheet, { props: { open: true, onclose: vi.fn(), title: 'Settings', children } });
		expect(screen.getByTestId('sheet')).toBe(screen.getByRole('dialog'));
		expect(screen.getByTestId('sheet-close')).toHaveAccessibleName('Close modal');
		expect(screen.getByTestId('sheet-backdrop')).toHaveAccessibleName('Close sheet');
	});

	it('derives the backdrop from the sheet’s test id, so two sheets never share one', () => {
		const first = render(Sheet, {
			props: {
				open: true,
				onclose: vi.fn(),
				title: 'Settings',
				testid: 'settings-sheet',
				children
			}
		});
		const second = render(Sheet, {
			props: { open: true, onclose: vi.fn(), title: 'Day', testid: 'day-sheet', children }
		});
		// One backdrop each, named after its own sheet: neither container grew a
		// shared `sheet-backdrop`.
		const backdrops = (container: HTMLElement) =>
			container.querySelectorAll('[data-testid$="-backdrop"]');
		expect(backdrops(first.container)).toHaveLength(1);
		expect(backdrops(first.container)[0]).toHaveAttribute(
			'data-testid',
			'settings-sheet-backdrop'
		);
		expect(backdrops(second.container)).toHaveLength(1);
		expect(backdrops(second.container)[0]).toHaveAttribute('data-testid', 'day-sheet-backdrop');
	});

	it('leaves Escape to a child that already handled it', () => {
		const footer = createRawSnippet(() => ({
			render: () => '<button type="button">Save</button>'
		}));
		const onclose = vi.fn();
		render(Sheet, { props: { open: true, onclose, title: 'Settings', children, footer } });

		// A confirm inside the sheet handles Esc first and claims the key.
		const child = screen.getByRole('button', { name: 'Save' });
		child.addEventListener('keydown', (event) => event.preventDefault());
		const handled = new KeyboardEvent('keydown', {
			key: 'Escape',
			bubbles: true,
			cancelable: true
		});
		child.dispatchEvent(handled);

		expect(handled.defaultPrevented).toBe(true);
		expect(onclose).not.toHaveBeenCalled();
	});

	it('reopens at rest after being closed mid-swipe', async () => {
		const onclose = vi.fn();
		const { container, rerender } = render(Sheet, {
			props: { open: true, onclose, title: 'Day', variant: 'bottom', children }
		});
		const handle = container.querySelector<HTMLElement>('[data-drag-handle]');
		if (!handle) throw new Error('bottom sheet has no drag handle');

		// The panel's own inline style is the observable: 180 - 100 px of drag.
		const panelStyle = () => screen.getByRole('dialog').getAttribute('style');
		handle.dispatchEvent(touch('touchstart', [100]));
		handle.dispatchEvent(touch('touchmove', [180]));
		// A raw dispatch does not flush like fireEvent does.
		await tick();
		expect(panelStyle()).toContain('translateY(80px)');

		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onclose).toHaveBeenCalledTimes(1);
		// The close dropped the drag, so even before the parent reopens it the
		// panel is back at rest.
		expect(panelStyle()).toContain('translateY(0px)');

		await rerender({ open: true, onclose, title: 'Day', variant: 'bottom', children });
		expect(panelStyle()).toContain('translateY(0px)');
	});
});
