/**
 * "Export for agent" as the admin sees it: collapsed first, the readonly text
 * revealed on demand, Copy telling the truth (success toast or the
 * select-and-press hint), and the download named with the caller's date.
 * Replaces the legacy `src/lib/admin/AdminExport.svelte.test.ts` cases.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import FeedbackExport from './FeedbackExport.svelte';

afterEach(() => {
	cleanup();
	// Leave jsdom's navigator as it was: the clipboard ladder must run both ways.
	Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
});

function renderExport(text = 'BUG REPORTS EXPORT\nOpen: 0') {
	const toasts = memoryToasts();
	render(FeedbackExport, {
		props: {
			exportText: text,
			fileBase: 'bug-reports',
			textareaId: 'bug-export-text',
			today: '2026-11-21',
			toasts
		}
	});
	return toasts;
}

describe('FeedbackExport', () => {
	it('starts collapsed and reveals the readonly export text on demand', async () => {
		renderExport();
		expect(screen.getByRole('button', { name: 'Export for agent' })).toBeInTheDocument();
		expect(document.querySelector('#bug-export-text')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));

		const textarea = document.querySelector<HTMLTextAreaElement>('#bug-export-text');
		if (!textarea) throw new Error('expected the readonly export textarea');
		expect(textarea.readOnly).toBe(true);
		expect(textarea.value).toBe('BUG REPORTS EXPORT\nOpen: 0');
		expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Download .txt' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Hide export' })).toBeInTheDocument();
	});

	it('toasts after copying to the clipboard', async () => {
		const written: string[] = [];
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: async (text: string) => void written.push(text) },
			configurable: true
		});
		const toasts = renderExport('payload');

		await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

		await vi.waitFor(() => expect(toasts.items).toHaveLength(1));
		expect(written).toEqual(['payload']);
		expect(toasts.items).toEqual([
			{ kind: 'success', text: 'Export copied to clipboard — paste it into your agent.' }
		]);
	});

	it('tells the admin to copy manually when the clipboard is blocked', async () => {
		const toasts = renderExport();

		await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

		await vi.waitFor(() => expect(toasts.items).toHaveLength(1));
		expect(toasts.items).toEqual([
			{ kind: 'error', text: "Couldn't copy — text is selected, press Ctrl/Cmd+C." }
		]);
	});

	it('downloads with the caller’s date in the filename', async () => {
		const originalCreate = URL.createObjectURL;
		const originalRevoke = URL.revokeObjectURL;
		const originalClick = HTMLAnchorElement.prototype.click;
		const downloads: string[] = [];
		URL.createObjectURL = () => 'blob:export';
		URL.revokeObjectURL = () => {};
		HTMLAnchorElement.prototype.click = function captureDownload(this: HTMLAnchorElement) {
			downloads.push(this.download);
		};
		try {
			renderExport();
			await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Download .txt' }));
			await vi.waitFor(() =>
				expect(downloads).toEqual(['bug-reports-2026-11-21.txt'])
			);
		} finally {
			HTMLAnchorElement.prototype.click = originalClick;
			URL.createObjectURL = originalCreate;
			URL.revokeObjectURL = originalRevoke;
		}
	});
});
