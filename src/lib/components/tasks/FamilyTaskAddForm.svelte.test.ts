import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import FamilyTaskAddForm from './FamilyTaskAddForm.svelte';

const members = [{ userId: 'u1', firstName: 'Bo', lastName: 'Jo' }];
const base = {
	familyId: 'fam1',
	members,
	currentUserId: 'u1',
	memberName: () => 'Bo Jo',
	onAdded: () => {}
};

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({ ok: true, json: async () => ({}) }))
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

describe('FamilyTaskAddForm', () => {
	it('posts the parsed quick-add and resets on success', async () => {
		const onAdded = vi.fn();
		render(FamilyTaskAddForm, { props: { ...base, onAdded } });
		await fireEvent.input(screen.getByPlaceholderText('Add a family task...'), {
			target: { value: 'Mow the lawn' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
		expect(vi.mocked(fetch)).toHaveBeenCalledWith(
			'/api/tasks',
			expect.objectContaining({
				method: 'POST',
				body: expect.stringContaining('"familyId":"fam1"')
			})
		);
		expect(screen.getByPlaceholderText('Add a family task...')).toHaveValue('');
	});

	it('passes the created task to onAdded for instant display', async () => {
		const created = { id: 't9', title: 'Mow the lawn', tags: [] };
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ task: created })
		} as unknown as Response);
		const onAdded = vi.fn();
		render(FamilyTaskAddForm, { props: { ...base, onAdded } });
		await fireEvent.input(screen.getByPlaceholderText('Add a family task...'), {
			target: { value: 'Mow the lawn' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
		expect(onAdded).toHaveBeenCalledWith(created);
	});

	it('keeps the draft when the POST fails', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
		render(FamilyTaskAddForm, { props: base });
		await fireEvent.input(screen.getByPlaceholderText('Add a family task...'), {
			target: { value: 'Mow the lawn' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		await waitFor(() =>
			expect(screen.getByPlaceholderText('Add a family task...')).not.toHaveValue('')
		);
	});

	describe('category (#283)', () => {
		const lastBody = () => {
			const call = vi.mocked(fetch).mock.calls.at(-1);
			// SAFETY: the form always POSTs a JSON string body.
			return JSON.parse(call?.[1]?.body as string);
		};

		it('offers the viewer categories and sends the chosen one, then resets', async () => {
			const onAdded = vi.fn();
			render(FamilyTaskAddForm, {
				props: { ...base, onAdded, categories: ['Errands', 'Home'] }
			});
			// SAFETY: the Category field is an <input> in CategoryField.
			const input = screen.getByLabelText('Category') as HTMLInputElement;
			expect(
				document.querySelectorAll(`datalist#${input.getAttribute('list')} option`)
			).toHaveLength(2);
			await fireEvent.input(input, { target: { value: '  Home ' } });
			await fireEvent.input(screen.getByPlaceholderText('Add a family task...'), {
				target: { value: 'Mow the lawn' }
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
			await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
			expect(lastBody().category).toBe('Home');
			expect(input.value).toBe('');
		});

		it('sends no category key when none is set', async () => {
			const onAdded = vi.fn();
			render(FamilyTaskAddForm, { props: { ...base, onAdded } });
			await fireEvent.input(screen.getByPlaceholderText('Add a family task...'), {
				target: { value: 'Mow the lawn' }
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
			await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
			expect('category' in lastBody()).toBe(false);
		});
	});
});
