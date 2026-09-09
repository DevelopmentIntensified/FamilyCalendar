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

	it('keeps the draft when the POST fails', async () => {
		vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({}) });
		render(FamilyTaskAddForm, { props: base });
		await fireEvent.input(screen.getByPlaceholderText('Add a family task...'), {
			target: { value: 'Mow the lawn' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		await waitFor(() =>
			expect(screen.getByPlaceholderText('Add a family task...')).not.toHaveValue('')
		);
	});
});
