import { describe, it, expect } from 'vitest';
import { TASK_SMART_CATEGORIES, TASK_SMART_TEMPLATES } from './tasks.smart.rules';

describe('task smart templates', () => {
	it('groups every template under a known category', () => {
		for (const template of TASK_SMART_TEMPLATES) {
			expect(Object.keys(TASK_SMART_CATEGORIES)).toContain(template.category);
			expect(Object.keys(TASK_SMART_CATEGORIES).length).toBe(3);
		}
	});

	it('has unique ids and a positive interval per template', () => {
		const ids = TASK_SMART_TEMPLATES.map((template) => template.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const template of TASK_SMART_TEMPLATES) {
			expect(template.name.trim()).not.toBe('');
			expect(template.recurrenceInterval).toBeGreaterThanOrEqual(1);
			expect(['daily', 'weekly', 'monthly', 'yearly']).toContain(template.recurrenceFrequency);
		}
	});

	it('offers every category at least one template', () => {
		for (const category of Object.keys(TASK_SMART_CATEGORIES)) {
			expect(TASK_SMART_TEMPLATES.some((template) => template.category === category)).toBe(true);
		}
	});
});
