/**
 * One Dashboard Module switch row as the person sees it: the label and the two
 * chips, the form payload, the <100ms acknowledge without a self-decided flip,
 * the optimistic override, the in-flight busy row, and the no-widening label.
 * The legacy component test
 * `src/lib/components/dashboard/DashboardModuleRow.svelte.test.ts` asserted
 * the same behaviour; this file replaces it (S8 deleted the old one).
 *
 * `enhance` is a prop (the route passes the real `$app/forms` action), so the
 * tests pass a capture fake — no `vi.mock`, no `$app/*`.
 *
 * Doc: ../README.md#public-interface
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import type { ModuleScope } from '../dashboardModules.registry.rules';
import type { ModuleRowState, ModuleToggleValue } from '../dashboardModules.row.rules';
import DashboardModuleRow from './DashboardModuleRow.svelte';

type FormEnhancer = (node: HTMLFormElement, submit: SubmitFunction) => { destroy(): void };

type RowProps = {
	label: string;
	scope: ModuleScope;
	state: ModuleRowState;
	submitValue: ModuleToggleValue;
	moduleId: string;
	action?: string;
	pending?: boolean;
	optimistic?: ModuleRowState | null;
	onAcknowledge?: (() => void) | null;
	enhance?: FormEnhancer;
	onSubmit?: SubmitFunction;
};

/** The row with every prop a family-hub caller supplies. */
function row(overrides: Partial<RowProps> = {}): RowProps {
	return {
		label: 'Family Task Board',
		scope: 'family',
		state: 'on',
		submitValue: 'false',
		moduleId: 'board',
		...overrides
	};
}

/** The `enhance` action as the route passes it; captures the submit function. */
function captureEnhance(): { enhance: FormEnhancer; submits: SubmitFunction[] } {
	const submits: SubmitFunction[] = [];
	const enhance: FormEnhancer = (_node, submit) => {
		submits.push(submit);
		return { destroy: () => {} };
	};
	return { enhance, submits };
}

afterEach(cleanup);

describe('DashboardModuleRow — what the reader sees', () => {
	it('shows an on row: label + family-wide scope + On', () => {
		render(DashboardModuleRow, { props: row() });
		expect(screen.getByText('Family Task Board')).toBeInTheDocument();
		expect(screen.getByText('Family-wide')).toBeInTheDocument();
		expect(screen.getByText('On')).toBeInTheDocument();
		expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
	});

	it('shows an off row with its own tone', () => {
		render(DashboardModuleRow, { props: row({ state: 'off', submitValue: 'true' }) });
		const state = screen.getByText('Off');
		expect(state).toHaveClass('bg-slate-200', 'text-slate-500');
		expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
	});

	it('shows a hidden-for-me row without claiming the family is off', () => {
		render(
			DashboardModuleRow,
			{ props: row({ state: 'hidden-for-me', submitValue: 'false' }) }
		);
		const state = screen.getByText('Hidden for you');
		expect(state).toHaveClass('bg-amber-100', 'text-amber-700');
		expect(state).not.toHaveClass('bg-slate-200');
		expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
	});

	it('labels a personal module Personal, not Family-wide', () => {
		render(DashboardModuleRow, {
			props: row({ label: 'Daily Verse', scope: 'personal', moduleId: 'verse' })
		});
		expect(screen.getByText('Personal')).toBeInTheDocument();
		expect(screen.queryByText('Family-wide')).not.toBeInTheDocument();
	});
});

describe('DashboardModuleRow — the control', () => {
	it('carries the module id and the flip on the submit button', () => {
		render(DashboardModuleRow, { props: row() });
		const form = screen.getByRole('button').closest('form');
		expect(form).not.toBeNull();
		expect(form).toHaveAttribute('method', 'POST');
		expect(form).toHaveAttribute('action', '?/toggleDashboardModule');
		expect(form?.querySelector('input[name="module"]')).toHaveValue('board');
		expect(screen.getByRole('button')).toHaveAttribute('name', 'enabled');
		expect(screen.getByRole('button')).toHaveAttribute('value', 'false');
	});

	it('hands the enhance action the form and the caller’s submit callback', async () => {
		const { enhance, submits } = captureEnhance();
		const onSubmit = vi.fn();
		render(DashboardModuleRow, { props: row({ enhance, onSubmit }) });
		await tick();
		expect(submits).toEqual([onSubmit]);
	});

	it('acknowledges the click in the same tick, without deciding what changes', async () => {
		const onAcknowledge = vi.fn();
		render(DashboardModuleRow, { props: row({ onAcknowledge }) });
		await fireEvent.click(screen.getByRole('button'));
		expect(onAcknowledge).toHaveBeenCalledTimes(1);
		// The row reports the activation; the owner answers via `optimistic`.
		expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
	});

	it('still submits a plain form without a caller callback', async () => {
		render(DashboardModuleRow, { props: row() });
		const button = screen.getByRole('button');
		const submit = vi.fn((event: Event) => event.preventDefault());
		button.closest('form')?.addEventListener('submit', submit);
		await fireEvent.click(button);
		expect(submit).toHaveBeenCalledTimes(1);
	});

	it('shows the optimistic override before the server answers, then reverts', async () => {
		const props = row();
		const { rerender } = render(DashboardModuleRow, { props });
		expect(screen.getByText('On')).toBeInTheDocument();
		await rerender({ ...props, optimistic: 'off' });
		expect(screen.getByText('Off')).toBeInTheDocument();
		expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
		await rerender({ ...props, optimistic: null });
		expect(screen.getByText('On')).toBeInTheDocument();
		expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
	});

	it('marks the row busy while a flip is in flight without hiding its label', () => {
		render(DashboardModuleRow, { props: row({ pending: true, optimistic: 'off' }) });
		const button = screen.getByRole('button');
		expect(button).toHaveAttribute('aria-busy', 'true');
		expect(button).toHaveAttribute('aria-pressed', 'false');
		expect(button).toHaveClass('opacity-70');
		expect(button).not.toBeDisabled();
		expect(screen.getByText('Family Task Board')).toBeInTheDocument();
	});
});

describe('DashboardModuleRow — no horizontal overflow at 320px', () => {
	it('truncates the label rather than widening the row', () => {
		render(DashboardModuleRow, {
			props: row({ label: 'Kids’ Schedule with a very long descriptive label' })
		});
		const label = screen.getByText('Kids’ Schedule with a very long descriptive label');
		expect(label).toHaveClass('min-w-0', 'flex-1', 'truncate');
		// The chips are the row's fixed-width ends: they shrink to their text and
		// never push the label.
		expect(screen.getByText('Family-wide')).toHaveClass('shrink-0');
		expect(screen.getByText('On')).toHaveClass('shrink-0');
	});
});
