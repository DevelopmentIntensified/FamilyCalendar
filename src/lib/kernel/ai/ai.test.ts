import { describe, expect, it } from 'vitest';
import { createMemoryAi } from './ai';

describe('createMemoryAi', () => {
	it('records every completion in call order', async () => {
		const ai = createMemoryAi();

		expect(ai.calls).toEqual([]);
		await ai.chatJson('parse an event', 'Dentist Tuesday 3pm');
		await ai.chatJson('parse a task', 'Mow the lawn');

		expect(ai.calls).toEqual([
			{ system: 'parse an event', user: 'Dentist Tuesday 3pm' },
			{ system: 'parse a task', user: 'Mow the lawn' }
		]);
	});

	it('answers the scripted replies in order, then null', async () => {
		const ai = createMemoryAi();
		ai.script({ title: 'Dentist' }, null);

		await expect(ai.chatJson('s', 'u')).resolves.toEqual({ title: 'Dentist' });
		await expect(ai.chatJson('s', 'u')).resolves.toBeNull();
		await expect(ai.chatJson('s', 'u')).resolves.toBeNull();
	});

	it('is configured unless the test says otherwise', async () => {
		expect(createMemoryAi().configured()).toBe(true);
		expect(createMemoryAi({ configured: false }).configured()).toBe(false);
	});
});
