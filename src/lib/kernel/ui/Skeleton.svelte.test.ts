/**
 * Loading placeholders (legacy copies in AccountNotificationsSection,
 * ChecklistSection and EventModal drew their own `animate-pulse` rows).
 * Reduced motion is handled globally in src/app.css, like the legacy copies.
 *
 * Each shape reproduces one original's markup, and the block announces itself
 * as a status named by `label`, so a loading section is not silent.
 *
 * Doc: src/lib/kernel/README.md
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Skeleton from './Skeleton.svelte';

afterEach(cleanup);

const rows = (container: HTMLElement) => container.querySelectorAll('[data-skeleton-line]');
const root = () => screen.getByRole('status');

describe('Skeleton', () => {
	it('draws three text rows by default', () => {
		const { container } = render(Skeleton);
		expect(rows(container)).toHaveLength(3);
		for (const row of rows(container)) {
			expect(row).toHaveClass('h-3.5', 'w-full', 'animate-pulse', 'rounded', 'bg-slate-200');
		}
	});

	it('draws as many rows as asked', () => {
		const { container } = render(Skeleton, { props: { lines: 5 } });
		expect(rows(container)).toHaveLength(5);
	});

	it('announces itself as a status named by its label instead of hiding', () => {
		render(Skeleton, { props: { lines: 1, label: 'Loading checklist' } });
		expect(root()).toHaveAttribute('role', 'status');
		expect(root()).toHaveTextContent('Loading checklist');
		expect(root()).not.toHaveAttribute('aria-hidden');
	});

	it('takes a test id, so each section keeps its own placeholder hook', () => {
		render(Skeleton, { props: { testid: 'notification-skeleton', shape: 'toggle' } });
		expect(screen.getByTestId('notification-skeleton')).toBe(root());
	});

	it('applies the caller’s class next to its own spacing', () => {
		const { container } = render(Skeleton, { props: { lines: 1, class: 'mt-4' } });
		const block = container.querySelector('[data-testid="skeleton"]');
		expect(block).toHaveClass('space-y-2', 'mt-4');
	});

	it('reproduces the notifications toggle row: a switch and two text lines', () => {
		const { container } = render(Skeleton, { props: { shape: 'toggle' } });
		const row = container.querySelector('.flex.items-center.gap-3');
		if (!(row instanceof HTMLElement)) throw new Error('missing toggle row');
		expect(row).toHaveClass('py-2.5');
		const toggle = row.querySelector('span.h-\\[1\\.375rem\\].w-10');
		expect(toggle).toHaveClass('rounded-full', 'bg-slate-200', 'animate-pulse');
		// Title line, then the fainter hint line.
		expect(row.querySelector('.h-3\\.5.w-32')).toHaveClass('bg-slate-200');
		expect(row.querySelector('.h-2\\.5.w-20')).toHaveClass('bg-slate-100');
	});

	it('reproduces the checklist row: a circle and a bar, two of them by default', () => {
		const { container } = render(Skeleton, { props: { shape: 'row' } });
		expect(rows(container)).toHaveLength(4);
		expect(container.querySelectorAll('.h-4.w-4.rounded-full')).toHaveLength(2);
		expect(container.querySelectorAll('.h-3\\.5.flex-1')).toHaveLength(2);
		for (const bar of container.querySelectorAll('.h-3\\.5.flex-1')) {
			expect(bar).toHaveClass('bg-slate-100', 'animate-pulse');
		}
	});

	it('reproduces the attendee block: a heading and two chip groups', () => {
		const { container } = render(Skeleton, { props: { shape: 'chips' } });
		expect(container.querySelector('.mb-4.h-4.w-24')).toHaveClass('bg-slate-100');
		const groups = container.querySelectorAll('.flex.flex-wrap');
		expect(groups).toHaveLength(2);
		expect(groups[0].children).toHaveLength(3);
		expect(groups[0].children[0]).toHaveClass('h-7', 'w-24', 'rounded-full');
		expect(groups[1].children).toHaveLength(2);
		expect(groups[1].children[0]).toHaveClass('h-7', 'w-20', 'rounded-full');
	});
});
