/**
 * `ShellVerifyState` in node: the trimmed submit, the server's sentence inline,
 * the three failure copies (server, resend fallback, no connection) and the 3 s
 * "Sent again ✓" receipt.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { manualScheduler } from '$lib/kernel/testing/manualScheduler';
import type { ShellVerifyPort, ShellVerifyResult } from './shell.contract';
import { ShellVerifyState } from './shell.verify.state.svelte.js';

function portOf(answers: {
	submit?: (code: string) => Promise<ShellVerifyResult>;
	resend?: () => Promise<ShellVerifyResult>;
}): ShellVerifyPort & { readonly codes: string[] } {
	const codes: string[] = [];
	return {
		codes,
		submitCode: (code) => {
			codes.push(code);
			return answers.submit?.(code) ?? Promise.resolve({ ok: true });
		},
		resendCode: () => answers.resend?.() ?? Promise.resolve({ ok: true })
	};
}

describe('ShellVerifyState', () => {
	it('shows the server error inline and clears the sent receipt after 3 s', async () => {
		const scheduler = manualScheduler();
		let verified = 0;
		const port = portOf({
			submit: async () => ({ ok: false, message: 'Invalid code' }),
			resend: async () => ({ ok: true })
		});
		const state = new ShellVerifyState(port, {
			schedule: scheduler.schedule,
			onVerified: () => verified++
		});

		state.code = '  123456  ';
		await state.submit();
		expect(port.codes).toEqual(['123456']);
		expect(state.error).toBe('Invalid code');
		expect(state.busy).toBe(false);
		expect(verified).toBe(0);

		await state.resend();
		expect(state.resent).toBe(true);
		expect(state.error).toBe('');
		expect(scheduler.tasks.map((task) => task.ms)).toEqual([3000]);
		scheduler.fireAll();
		expect(state.resent).toBe(false);
	});

	it('refreshes the scope once the code is accepted', async () => {
		let verified = 0;
		const state = new ShellVerifyState(portOf({}), {
			schedule: manualScheduler().schedule,
			onVerified: () => verified++
		});
		state.code = 'abcdef';
		await state.submit();
		expect(verified).toBe(1);
		expect(state.error).toBe('');
	});

	it('keeps the legacy fallbacks for a refused resend and a dropped connection', async () => {
		const refused = new ShellVerifyState(
			portOf({ resend: async () => ({ ok: false, message: '' }) }),
			{ schedule: manualScheduler().schedule, onVerified: () => {} }
		);
		await refused.resend();
		expect(refused.error).toBe("Couldn't resend the code — try again.");

		const offline = new ShellVerifyState(
			portOf({ resend: () => Promise.reject(new Error('offline')) }),
			{ schedule: manualScheduler().schedule, onVerified: () => {} }
		);
		await offline.resend();
		expect(offline.error).toBe("Couldn't resend the code — check your connection.");
	});

	it('ignores a blank code and a second submit while busy', async () => {
		const port = portOf({});
		const state = new ShellVerifyState(port, {
			schedule: manualScheduler().schedule,
			onVerified: () => {}
		});
		expect(state.canSubmit).toBe(false);
		state.code = '   ';
		await state.submit();
		expect(port.codes).toEqual([]);

		state.code = '654321';
		const first = state.submit();
		await state.submit();
		await first;
		expect(port.codes).toEqual(['654321']);
	});
});
