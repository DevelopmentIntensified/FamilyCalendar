import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MemberSearchTab from './MemberSearchTab.svelte';

const props = { familyId: 'fam1', onSuccess: () => {}, onError: () => {} };

beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			if (String(url).startsWith('/api/family/search')) {
				return {
					ok: true,
					json: async () => ({
						users: [{ id: 'u9', firstName: 'Zed', lastName: 'Zedson', email: 'zed@x.com' }]
					})
				};
			}
			return { ok: true, json: async () => ({}) };
		})
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	cleanup();
});

describe('MemberSearchTab', () => {
	it('searches after 2+ chars and lists results', async () => {
		render(MemberSearchTab, { props });
		await fireEvent.input(screen.getByPlaceholderText('Type to search...'), {
			target: { value: 'ze' }
		});
		await vi.advanceTimersByTimeAsync(350);
		expect(await screen.findByText('zed@x.com')).toBeInTheDocument();
	});

	it('posts the selected user and reports success', async () => {
		const onSuccess = vi.fn();
		const fetchMock = vi.mocked(fetch);
		render(MemberSearchTab, { props: { ...props, onSuccess } });
		await fireEvent.input(screen.getByPlaceholderText('Type to search...'), {
			target: { value: 'ze' }
		});
		await vi.advanceTimersByTimeAsync(350);
		await fireEvent.click(await screen.findByText('zed@x.com'));
		await fireEvent.click(screen.getByRole('button', { name: 'Add to Family' }));
		await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith(
			'/family/fam1/members/add/direct',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('reports a failed add without success', async () => {
		const onError = vi.fn();
		const onSuccess = vi.fn();
		vi.mocked(fetch).mockImplementation(async (url) => {
			if (String(url).startsWith('/api/family/search')) {
				return {
					ok: true,
					json: async () => ({
						users: [{ id: 'u9', firstName: 'Zed', lastName: 'Zedson', email: 'zed@x.com' }]
					})
				} as Response;
			}
			return { ok: true, json: async () => ({ error: 'Already a member' }) } as Response;
		});
		render(MemberSearchTab, { props: { ...props, onError, onSuccess } });
		await fireEvent.input(screen.getByPlaceholderText('Type to search...'), {
			target: { value: 'ze' }
		});
		await vi.advanceTimersByTimeAsync(350);
		await fireEvent.click(await screen.findByText('zed@x.com'));
		await fireEvent.click(screen.getByRole('button', { name: 'Add to Family' }));
		await waitFor(() => expect(onError).toHaveBeenCalledWith('Already a member'));
		expect(onSuccess).not.toHaveBeenCalled();
	});

	it.each([
		['a SvelteKit 500 body ({message})', { message: 'Internal Error' }, 'Internal Error'],
		['an empty error body', {}, 'Something went wrong. Please try again.']
	])('reports a server error (%s) without success — issue 250', async (_label, body, shown) => {
		const onError = vi.fn();
		const onSuccess = vi.fn();
		vi.mocked(fetch).mockImplementation(async (url) => {
			if (String(url).startsWith('/api/family/search')) {
				return {
					ok: true,
					json: async () => ({
						users: [{ id: 'u9', firstName: 'Zed', lastName: 'Zedson', email: 'zed@x.com' }]
					})
				} as Response;
			}
			return { ok: false, status: 500, json: async () => body } as Response;
		});
		render(MemberSearchTab, { props: { ...props, onError, onSuccess } });
		await fireEvent.input(screen.getByPlaceholderText('Type to search...'), {
			target: { value: 'ze' }
		});
		await vi.advanceTimersByTimeAsync(350);
		await fireEvent.click(await screen.findByText('zed@x.com'));
		await fireEvent.click(screen.getByRole('button', { name: 'Add to Family' }));
		await waitFor(() => expect(onError).toHaveBeenCalledWith(shown));
		expect(onSuccess).not.toHaveBeenCalled();
	});
});
