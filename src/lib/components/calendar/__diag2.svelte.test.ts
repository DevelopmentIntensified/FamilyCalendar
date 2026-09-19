import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { tick } from 'svelte';
import EventFormModal from './EventFormModal.svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(), goto: vi.fn() }));

describe('diag2', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ parsed: { title: 'X', date: '2026-05-05' }, confidence: 0.9 }) })));
		vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		cleanup();
	});
	it('dump title field + isDetected', async () => {
		render(EventFormModal, { props: { show: true, calendarIds: [{ id: 'cal1', name: 'C' }] } });
		const nlInput = screen.getAllByPlaceholderText(/lunch friday/i)[0];
		await fireEvent.input(nlInput, { target: { value: 'X next Tuesday' } });
		await vi.advanceTimersByTimeAsync(350);
		await tick();
		const titleEl = document.querySelector('input[name="title"]') as HTMLInputElement | null;
		console.log('TITLE VAL: ' + JSON.stringify(titleEl?.value));
		console.log('BODY HAS "X next Tuesday" leaf: ' + document.body.innerHTML.includes('X next Tuesday'));
		const dateInput = screen.queryByLabelText(/start date/i);
		console.log('START DATE: ' + !!dateInput);
		const allInputs = [...document.querySelectorAll('input')].map((i) => (i as HTMLInputElement).id || i.getAttribute('aria-label') || i.name).filter(Boolean).slice(0, 20);
		console.log('INPUT IDS: ' + JSON.stringify(allInputs));
		expect(true).toBe(true);
	});
});
