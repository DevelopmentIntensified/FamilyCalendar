import { describe, expect, it } from 'vitest';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import { fixedClock } from './clock';
import { Ticker } from './ticker.svelte.js';

describe('Ticker', () => {
	it('starts at the clock instant', () => {
		const ticker = new Ticker(
			fixedClock('2026-01-15T12:00:00.000Z'),
			1000,
			manualScheduler().schedule
		);

		expect(ticker.now.toISOString()).toBe('2026-01-15T12:00:00.000Z');
	});

	it('updates now on every tick', () => {
		const clock = fixedClock('2026-01-15T12:00:00.000Z');
		const scheduler = manualScheduler();
		const ticker = new Ticker(clock, 1000, scheduler.schedule);

		ticker.start();
		clock.advanceMs(30_000);
		scheduler.fireAll();
		expect(ticker.now.toISOString()).toBe('2026-01-15T12:00:30.000Z');

		clock.advanceMs(30_000);
		scheduler.fireAll();
		expect(ticker.now.toISOString()).toBe('2026-01-15T12:01:00.000Z');
	});

	it('keeps ticking on its interval', () => {
		const scheduler = manualScheduler();
		const ticker = new Ticker(fixedClock(), 1000, scheduler.schedule);

		ticker.start();
		expect(scheduler.tasks).toHaveLength(1);
		expect(scheduler.tasks[0].ms).toBe(1000);

		scheduler.fireAll();
		expect(scheduler.tasks).toHaveLength(1);
		expect(scheduler.tasks[0].ms).toBe(1000);
	});

	it('stop halts further ticks', () => {
		const scheduler = manualScheduler();
		const ticker = new Ticker(fixedClock(), 1000, scheduler.schedule);

		ticker.start();
		ticker.stop();
		scheduler.fireAll();

		expect(scheduler.tasks).toHaveLength(0);
	});

	it('start twice registers one timer', () => {
		const scheduler = manualScheduler();
		const ticker = new Ticker(fixedClock(), 1000, scheduler.schedule);

		ticker.start();
		ticker.start();

		expect(scheduler.tasks).toHaveLength(1);
	});
});
