import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import AdminExport from './AdminExport.svelte';

afterEach(() => {
	cleanup();
});

describe('AdminExport', () => {
	it('reveals the export text with Copy and Download actions on toggle', async () => {
		render(AdminExport, {
			props: { exportText: 'bug one\nbug two', fileBase: 'bug-reports', textareaId: 'test-export' }
		});
		expect(screen.queryByRole('textbox')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Export for agent' }));
		const box = await screen.findByRole('textbox');
		expect((box as HTMLTextAreaElement).value).toBe('bug one\nbug two');
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
