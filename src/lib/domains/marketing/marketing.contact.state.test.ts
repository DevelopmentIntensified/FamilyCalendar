/**
 * The contact form's client state in node, with a fake api: the pending guard,
 * the success swap, the wire sentence on a refusal (fields kept) and the clear
 * on "Send another message".
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { ContactApi, ContactFields, ContactSendResult } from './marketing.api';
import { MarketingContactState } from './marketing.contact.state.svelte';

function apiReturning(result: ContactSendResult): ContactApi & { calls: ContactFields[] } {
	const calls: ContactFields[] = [];
	return {
		calls,
		send: async (fields) => {
			calls.push(fields);
			return result;
		}
	};
}

const fields = { name: 'Alex', email: 'alex@example.com', message: 'Hi there' };

function filled(api: ContactApi): MarketingContactState {
	const state = new MarketingContactState(api);
	state.name = fields.name;
	state.email = fields.email;
	state.message = fields.message;
	return state;
}

describe('MarketingContactState', () => {
	it('sends the fields, then swaps the form for the success card', async () => {
		const api = apiReturning({ ok: true, data: { success: true } });
		const state = filled(api);

		await state.submit();

		expect(api.calls).toEqual([{ ...fields, website: '' }]);
		expect(state.sent).toBe(true);
		expect(state.pending).toBe(false);
		expect(state.error).toBe('');
	});

	it('shows the wire sentence and keeps every field when the action refuses', async () => {
		const api = apiReturning({ ok: false, status: 400, error: 'All fields are required' });
		const state = filled(api);

		await state.submit();

		expect(state.sent).toBe(false);
		expect(state.pending).toBe(false);
		expect(state.error).toBe('All fields are required');
		expect(state.name).toBe(fields.name);
		expect(state.email).toBe(fields.email);
		expect(state.message).toBe(fields.message);
	});

	it('sends the honeypot value the form carries', async () => {
		const api = apiReturning({ ok: false, status: 400, error: 'Invalid submission' });
		const state = filled(api);
		state.website = 'http://spam.example';

		await state.submit();

		expect(api.calls[0].website).toBe('http://spam.example');
	});

	it('ignores a second submit while the first is in flight', async () => {
		const early = Promise.withResolvers<ContactSendResult>();
		let calls = 0;
		const api: ContactApi = {
			send: () => {
				calls += 1;
				return early.promise;
			}
		};
		const state = filled(api);

		const first = state.submit();
		expect(state.pending).toBe(true);
		await state.submit();
		expect(calls).toBe(1);

		early.resolve({ ok: true, data: { success: true } });
		await first;
		expect(state.sent).toBe(true);
	});

	it('goes back to an empty form on "Send another message"', async () => {
		const api = apiReturning({ ok: true, data: { success: true } });
		const state = filled(api);
		state.website = 'x';
		await state.submit();

		state.sendAnother();

		expect(state.sent).toBe(false);
		expect(state.error).toBe('');
		expect([state.website, state.name, state.email, state.message]).toEqual(['', '', '', '']);
		expect(state.pending).toBe(false);
	});
});
