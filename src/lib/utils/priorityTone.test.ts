import { describe, expect, it } from 'vitest';
import {
	PRIORITY_DOT,
	dueTone,
	isOverdue,
	priorityDot,
	priorityLabel,
	priorityTone
} from './priorityTone';

describe('priorityTone', () => {
	it('low dot never outshouts normal (muted grey, high is the only saturated dot)', () => {
		expect(PRIORITY_DOT.high).toContain('red');
		expect(PRIORITY_DOT.normal).toBe('bg-slate-300');
		expect(PRIORITY_DOT.low).toBe('bg-slate-200');
	});

	it('dot mapping covers high/normal/low with normal fallback', () => {
		expect(priorityDot('high')).toBe(PRIORITY_DOT.high);
		expect(priorityDot('normal')).toBe(PRIORITY_DOT.normal);
		expect(priorityDot('low')).toBe(PRIORITY_DOT.low);
		expect(priorityDot('bogus')).toBe(PRIORITY_DOT.normal);
	});

	it('label mapping + passthrough for unknowns', () => {
		expect(priorityLabel('high')).toBe('High');
		expect(priorityLabel('normal')).toBe('Normal');
		expect(priorityLabel('low')).toBe('Low');
		expect(priorityLabel('bogus')).toBe('bogus');
	});

	it('label tone: low muted (slate-500), normal slate-600, high red', () => {
		expect(priorityTone('low')).toContain('slate-500');
		expect(priorityTone('normal')).toContain('slate-600');
		expect(priorityTone('high')).toContain('red');
	});
});

describe('dueTone', () => {
	it('overdue red / today amber / future grey / null empty (start-of-day boundary)', () => {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		yesterday.setHours(12, 0, 0, 0);
		const today = new Date();
		today.setHours(12, 0, 0, 0);
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		tomorrow.setHours(12, 0, 0, 0);
		expect(dueTone(yesterday.toISOString())).toContain('red');
		expect(dueTone(today.toISOString())).toContain('amber');
		expect(dueTone(tomorrow.toISOString())).toContain('slate');
		expect(dueTone(null)).toBe('');
		expect(isOverdue(yesterday.toISOString())).toBe(true);
		expect(isOverdue(today.toISOString())).toBe(false);
	});
});
