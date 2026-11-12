/**
 * The one pill used for tags, categories and status words (legacy copies in
 * TaskRow, CategoryChip, CategorySelect and TaskDetailModal all drew the same
 * rounded chip by hand).
 *
 * Doc: src/lib/kernel/README.md
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Pill from './Pill.svelte';

const label = (text: string) => createRawSnippet(() => ({ render: () => text }));

afterEach(cleanup);

describe('Pill', () => {
	it('renders its snippet in the legacy pill shape, neutral by default', () => {
		render(Pill, { props: { children: label('#school') } });
		const pill = screen.getByText('#school');
		expect(pill).toHaveClass('inline-flex', 'items-center', 'rounded-full', 'px-2', 'py-0.5');
		expect(pill).toHaveClass('bg-slate-100', 'text-slate-600');
	});

	it('uses the tone’s legacy colours', () => {
		const { unmount } = render(Pill, { props: { tone: 'danger', children: label('Overdue') } });
		expect(screen.getByText('Overdue')).toHaveClass('bg-red-100', 'text-red-700');
		unmount();

		render(Pill, { props: { tone: 'success', children: label('Done') } });
		expect(screen.getByText('Done')).toHaveClass('bg-emerald-100', 'text-emerald-700');
	});

	it('keeps a category teal, never tag-coloured (#280)', () => {
		const { unmount } = render(Pill, {
			props: { tone: 'category', testid: 'category-chip', children: label('school') }
		});
		expect(screen.getByTestId('category-chip')).toHaveClass('bg-teal-100', 'text-teal-800');
		unmount();

		render(Pill, { props: { tone: 'categoryMuted', children: label('school') } });
		expect(screen.getByText('school')).toHaveClass('bg-teal-100/60', 'text-teal-700/70');
	});

	it('uses the TaskDetailModal indigo for the Family span', () => {
		render(Pill, { props: { tone: 'family', children: label('Family') } });
		expect(screen.getByText('Family')).toHaveClass('bg-indigo-100', 'text-indigo-700');
	});

	it('uses the orange count pill for the done count', () => {
		render(Pill, { props: { tone: 'doneCount', children: label('🔥 3×') } });
		expect(screen.getByText('🔥 3×')).toHaveClass('bg-orange-100', 'text-orange-600');
	});

	it('passes the title through for the hover hint', () => {
		render(Pill, { props: { title: 'Category: school', children: label('school') } });
		expect(screen.getByText('school')).toHaveAttribute('title', 'Category: school');
	});
});
