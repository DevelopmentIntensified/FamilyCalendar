/**
 * Loading placeholders (legacy copies in AccountNotificationsSection,
 * ChecklistSection and EventModal drew their own `animate-pulse` rows).
 * Reduced motion is handled globally in src/app.css, like the legacy copies.
 *
 * Doc: src/lib/kernel/README.md
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Skeleton from './Skeleton.svelte';

afterEach(cleanup);

const rows = (container: HTMLElement) => container.querySelectorAll('[data-skeleton-line]');

describe('Skeleton', () => {
	it('draws three rows by default', () => {
		const { container } = render(Skeleton);
		expect(rows(container)).toHaveLength(3);
	});

	it('draws as many rows as asked', () => {
		const { container } = render(Skeleton, { props: { lines: 5 } });
		expect(rows(container)).toHaveLength(5);
	});

	it('marks the rows as animated placeholders and hides them from assistive tech', () => {
		const { container } = render(Skeleton, { props: { lines: 1 } });
		expect(rows(container)[0]).toHaveClass('animate-pulse');
		expect(container.querySelector('[data-testid="skeleton"]')).toHaveAttribute(
			'aria-hidden',
			'true'
		);
	});

	it('applies the caller’s class next to its own spacing', () => {
		const { container } = render(Skeleton, { props: { lines: 1, class: 'mt-4' } });
		const root = container.querySelector('[data-testid="skeleton"]');
		expect(root).toHaveClass('space-y-2', 'mt-4');
	});
});
