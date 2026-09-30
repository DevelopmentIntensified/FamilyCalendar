import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import DashboardModuleRow from './DashboardModuleRow.svelte';

afterEach(() => {
	cleanup();
});

const base = {
	label: 'Family Task Board',
	scope: 'family',
	moduleId: 'board',
	enabled: true
} as const;

function stateOf(el: HTMLElement | null | undefined) {
	return el?.textContent?.trim();
}

describe('DashboardModuleRow — label, scope and state read as one row', () => {
	it('shows an on row: label + family-wide scope + On', () => {
		render(DashboardModuleRow, {
			props: { ...base, state: 'on', submitValue: 'false' }
		});
		const row = screen.getByTestId('module-row');
		expect(row.textContent).toContain('Family Task Board');
		expect(row.textContent).toContain('Family-wide');
		expect(stateOf(screen.getByTestId('module-row-state'))).toBe('On');
	});

	it('shows an off row with its own tone and label', () => {
		render(DashboardModuleRow, {
			props: { ...base, state: 'off', submitValue: 'true' }
		});
		expect(stateOf(screen.getByTestId('module-row-state'))).toBe('Off');
		expect(screen.getByTestId('module-row-state').className).toContain('bg-slate-200');
	});

	it('shows a hidden-for-me row without claiming the family is off', () => {
		render(DashboardModuleRow, {
			props: { ...base, state: 'hidden-for-me', submitValue: 'false' }
		});
		expect(stateOf(screen.getByTestId('module-row-state'))).toBe('Hidden for you');
		expect(screen.getByTestId('module-row-state').className).toContain('bg-amber-100');
		expect(screen.getByTestId('module-row-state').className).not.toContain('bg-slate-200');
	});

	it('labels a personal module Personal, not Family-wide', () => {
		render(DashboardModuleRow, {
			props: {
				label: 'Daily Verse',
				scope: 'personal',
				moduleId: 'verse',
				state: 'on',
				submitValue: 'false'
			}
		});
		expect(screen.getByTestId('module-row').textContent).toContain('Personal');
		expect(screen.getByTestId('module-row').textContent).not.toContain('Family-wide');
	});
});

describe('DashboardModuleRow — one row, one control', () => {
	it('carries the module id and the flip value on the submit button', () => {
		render(DashboardModuleRow, {
			props: { ...base, state: 'on', submitValue: 'false' }
		});
		const button = screen.getByRole('button');
		expect(button.getAttribute('name')).toBe('enabled');
		expect(button.getAttribute('value')).toBe('false');
		expect((screen.getByTestId('module-row') as HTMLElement).closest('form')).toBeTruthy();
		expect(document.querySelector('input[name="module"]')?.getAttribute('value')).toBe('board');
	});

	it('posts the flip value through enhance, with the module id in the payload', async () => {
		const callback = vi.fn(
			async (_args: { formData: FormData; submitter: HTMLElement | null }) => {}
		);
		const onSubmit = vi.fn(() => callback);
		render(DashboardModuleRow, { props: { ...base, state: 'on', submitValue: 'false', onSubmit } });
		const button = screen.getByRole('button');
		await fireEvent.click(button);

		// enhance calls the factory, then hands the submit args to what the
		// factory returned — so the callback, not the factory, sees the payload.
		expect(onSubmit).toHaveBeenCalled();
		expect(callback).toHaveBeenCalledTimes(1);
		const args = callback.mock.calls[0][0];
		expect(args.formData.get('module')).toBe('board');
		expect(args.formData.get('enabled')).toBe('false');
		expect(args.submitter).toBe(button);
	});

	it('acknowledges the click in the same tick, without deciding what changes', async () => {
		const onAcknowledge = vi.fn();
		render(DashboardModuleRow, {
			props: { ...base, state: 'on', submitValue: 'false', onAcknowledge }
		});
		await fireEvent.click(screen.getByRole('button'));
		expect(onAcknowledge).toHaveBeenCalledTimes(1);
		// The row must not flip itself — the owner hands the answer back
		// through `optimistic`, so the row stays dumb about what a flip means.
		expect(stateOf(screen.getByTestId('module-row-state'))).toBe('On');
	});

	it('still submits a plain form without a caller callback', async () => {
		render(DashboardModuleRow, { props: { ...base, state: 'on', submitValue: 'false' } });
		const button = screen.getByRole('button');
		const submit = vi.fn((e: Event) => e.preventDefault());
		button.closest('form')!.addEventListener('submit', submit);
		await fireEvent.click(button);
		expect(submit).toHaveBeenCalledTimes(1);
	});

	it('shows the optimistic override before any server answer, then reverts when it clears', async () => {
		const { rerender } = render(DashboardModuleRow, {
			props: { ...base, state: 'on', submitValue: 'false', optimistic: 'off' }
		});
		expect(stateOf(screen.getByTestId('module-row-state'))).toBe('Off');
		expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('false');

		// Server failed (or answered with the old truth): the owner clears the
		// override and the row snaps back to the confirmed state.
		await rerender({ optimistic: null });
		expect(stateOf(screen.getByTestId('module-row-state'))).toBe('On');
		expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
	});

	it('marks the row busy while a flip is in flight without hiding its label', () => {
		render(DashboardModuleRow, {
			props: { ...base, state: 'off', submitValue: 'true', pending: true }
		});
		const button = screen.getByRole('button');
		expect(button.getAttribute('aria-busy')).toBe('true');
		expect(button.hasAttribute('disabled')).toBe(false);
		expect(screen.getByTestId('module-row').textContent).toContain('Family Task Board');
	});
});

describe('DashboardModuleRow — no horizontal overflow at 320px', () => {
	it('truncates the label rather than widening the row', () => {
		render(DashboardModuleRow, {
			props: {
				label: 'Kids Schedule with a very long descriptive label',
				scope: 'family',
				moduleId: 'kids',
				state: 'hidden-for-me',
				submitValue: 'false'
			}
		});
		const label = screen.getByTestId('module-row-label');
		expect(label.className).toContain('truncate');
		// The chips must not be the ones that give — both are shrink-0 only.
		expect(screen.getByTestId('module-row-state').className).toContain('shrink-0');
	});
});
