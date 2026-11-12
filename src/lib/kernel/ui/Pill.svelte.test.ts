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

	it('passes the title through for the hover hint', () => {
		render(Pill, { props: { title: 'Category: school', children: label('school') } });
		expect(screen.getByText('school')).toHaveAttribute('title', 'Category: school');
	});
});
