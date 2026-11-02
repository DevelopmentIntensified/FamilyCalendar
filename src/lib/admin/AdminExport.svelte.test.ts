import { describe, it, expect, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { toasts } from '$lib/client/toasts';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import AdminExport from './AdminExport.svelte';

afterEach(() => {
	cleanup();
	toasts.set([]);
	vi.unstubAllGlobals();
});

describe('AdminExport', () => {
	it('reveals the export text with Copy and Download actions on toggle', async () => {
		render(AdminExport, {
			props: { exportText: 'bug one\nbug two', fileBase: 'bug-reports', textareaId: 'test-export' }
		});
		expect(screen.queryByRole('textbox')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));
		const box = await screen.findByRole('textbox');
		expect(box).toHaveValue('bug one\nbug two');
		expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Download .txt' })).toBeInTheDocument();
	});

	it('hides the export again on second toggle', async () => {
		render(AdminExport, {
			props: { exportText: 'x', fileBase: 'bug-reports', textareaId: 'test-export' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));
		expect(await screen.findByRole('button', { name: 'Hide export' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Hide export' }));
		expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
	});
});

// Issue 262: Copy gave no confirmation.
describe('AdminExport copy feedback', () => {
	it('toasts after copying to the clipboard', async () => {
		const writeText = vi.fn(() => Promise.resolve());
		vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
		render(AdminExport, {
			props: { exportText: 'payload', fileBase: 'bug-reports', textareaId: 'test-export' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
		await vi.waitFor(() =>
			expect(get(toasts).map((t) => t.message)).toEqual([expect.stringMatching(/copied/i)])
		);
		expect(writeText).toHaveBeenCalledWith('payload');
	});

	it('tells the admin to copy manually when the clipboard is blocked', async () => {
		const writeText = vi.fn(() => Promise.reject(new Error('denied')));
		vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
		render(AdminExport, {
			props: { exportText: 'payload', fileBase: 'bug-reports', textareaId: 'test-export' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
		await vi.waitFor(() =>
			expect(get(toasts).map((t) => t.message)).toEqual([expect.stringMatching(/selected/i)])
		);
	});
});
