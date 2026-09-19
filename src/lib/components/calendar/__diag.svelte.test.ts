import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import EventFormModal from './EventFormModal.svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(), goto: vi.fn() }));

function stubFetchResponse(body: unknown) {
	return { ok: true, json: async () => body };
}

describe('diag', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', vi.fn());
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		cleanup();
	});
	it('dumps state after NLP parse', async () => {
		vi.mocked(fetch).mockResolvedValue(stubFetchResponse({ parsed: { title: 'X', date: '2026-05-05' }, confidence: 0.9 }) as never);
		render(EventFormModal, { props: { show: true, calendarIds: [{ id: 'cal1', name: 'C' }] } });
		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'X next Tuesday' } });
		console.log('FETCH CALLS pre-timer: ' + vi.mocked(fetch).mock.calls.length);
		await vi.advanceTimersByTimeAsync(350);
		console.log('FETCH CALLS post-timer: ' + vi.mocked(fetch).mock.calls.length);
		for (let i = 0; i < 20; i++) await Promise.resolve();
		const { tick } = await import('svelte');
		await tick();
		console.log('HAS START-DATE: ' + !!screen.queryByLabelText(/start date/i));
		console.log('SHOWMORE BTN: ' + document.body.innerHTML.includes('Show More'));
		console.log('SHOWLESS BTN: ' + document.body.innerHTML.includes('Show Less'));
		expect(true).toBe(true);
	});
});
