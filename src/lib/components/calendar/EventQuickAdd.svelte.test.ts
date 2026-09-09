import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import EventQuickAdd from './EventQuickAdd.svelte';

function props(overrides = {}) {
	return {
		nlInput: '',
		parsing: false,
		parseError: false,
		multiResults: null,
		submitting: false,
		lastParseResult: null,
		phraseReportable: false,
		phraseReported: false,
		reportingPhrase: false,
		onNlInputChange: vi.fn(),
		onClear: vi.fn(),
		onCreateAll: vi.fn(),
		onDismissMulti: vi.fn(),
		onReportPhrase: vi.fn(),
		...overrides
	};
}

describe('EventQuickAdd', () => {
	afterEach(cleanup);

	it('forwards typing and clear', async () => {
		const p = props();
		render(EventQuickAdd, { props: p });
		const input = screen.getByLabelText('Quick Add');
		await fireEvent.input(input, { target: { value: 'Lunch Friday' } });
		expect(p.onNlInputChange).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('Clear'));
		expect(p.onClear).toHaveBeenCalledOnce();
	});

	it('shows the spinner while parsing and the fallback note on error', () => {
		const { unmount } = render(EventQuickAdd, { props: props({ parsing: true }) });
		expect(document.querySelector('.animate-spin')).toBeTruthy();
		unmount();
		render(EventQuickAdd, { props: props({ parseError: true }) });
		expect(screen.getByText(/fill the fields below manually/)).toBeTruthy();
	});

	it('lists multi results with create-all and dismiss', async () => {
		const p = props({
			multiResults: [
				{ parsed: { title: 'A', date: '2026-09-01', startTime: '10:00' }, confidence: 1 },
				{ parsed: { title: 'B', date: '2026-09-02', startTime: null }, confidence: 1 }
			]
		});
		render(EventQuickAdd, { props: p });
		expect(screen.getByText('2 events detected')).toBeTruthy();
		await fireEvent.click(screen.getByText('Create 2 events'));
		expect(p.onCreateAll).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('Just the first'));
		expect(p.onDismissMulti).toHaveBeenCalledOnce();
	});

	it('offers the phrase report button', async () => {
		const p = props({ nlInput: 'lunch frday', phraseReportable: true });
		render(EventQuickAdd, { props: p });
		await fireEvent.click(screen.getByText('Parsed wrong? Report this phrase'));
		expect(p.onReportPhrase).toHaveBeenCalledOnce();
	});
});
