/**
 * The two admin register state classes, in node with a fake api and
 * `memoryToasts()`: the optimistic resolve, its rollback, the pending flag and
 * the export text that follows the open rows (issue 262).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import type { FeedbackRegisterApi, FeedbackResolveResult } from './feedback.api';
import type {
	BugReportWithReporter,
	FeedbackBugRegister,
	FeedbackPhraseRegister,
	UnmatchedPhraseView
} from './feedback.contract';
import { FeedbackBugRegisterState, FeedbackPhraseRegisterState } from './feedback.register.state.svelte.js';

const NOW = new Date('2026-11-21T09:00:00.000Z');
const ROW_AT = new Date('2026-11-01T09:00:00.000Z');
const ZONE = 'UTC';

function bugRow(id: string, description: string): BugReportWithReporter {
	return {
		id,
		userId: null,
		area: 'tasks',
		description,
		url: null,
		status: 'open',
		resolvedAt: null,
		createdAt: ROW_AT,
		updatedAt: ROW_AT,
		reporterFirstName: null,
		reporterLastName: null
	};
}

function phraseRow(id: string, phrase: string): UnmatchedPhraseView {
	return {
		id,
		source: 'event_parse',
		phrase,
		sample: phrase,
		matched: null,
		count: 2,
		resolved: false,
		createdAt: ROW_AT,
		updatedAt: ROW_AT
	};
}

function bugRegister(): FeedbackBugRegister {
	return { open: [bugRow('a', 'first report'), bugRow('b', 'second report')], resolved: [] };
}

function phraseRegister(): FeedbackPhraseRegister {
	return { open: [phraseRow('p1', 'call mom'), phraseRow('p2', 'dinner at six')], resolved: [] };
}

/** An api that answers every resolve with the given result and counts calls. */
function fakeApi(
	result: FeedbackResolveResult
): FeedbackRegisterApi & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		resolveBugReport: async (id) => {
			calls.push(`bug:${id}`);
			return result;
		},
		resolveUnmatchedPhrase: async (id) => {
			calls.push(`phrase:${id}`);
			return result;
		}
	};
}

const OK: FeedbackResolveResult = { ok: true };

describe('FeedbackBugRegisterState', () => {
	it('moves the resolved report out of the open list and out of the export', async () => {
		const toasts = memoryToasts();
		const state = new FeedbackBugRegisterState(fakeApi(OK), toasts, bugRegister(), NOW, ZONE);
		expect(state.exportText).toContain('first report');

		await state.resolve('a');

		expect(state.open.map((row) => row.id)).toEqual(['b']);
		expect(state.resolved.map((row) => [row.id, row.status, row.resolvedAt])).toEqual([
			['a', 'resolved', NOW]
		]);
		expect(state.exportText).not.toContain('first report');
		expect(state.exportText).toContain('second report');
		expect(toasts.items).toEqual([{ kind: 'success', text: 'Resolved' }]);
	});

	it('rolls back and explains when the server refuses', async () => {
		const toasts = memoryToasts();
		const api = fakeApi({ ok: false, status: 404, error: 'Bug report not found' });
		const state = new FeedbackBugRegisterState(api, toasts, bugRegister(), NOW, ZONE);

		await state.resolve('a');

		expect(state.open.map((row) => row.id)).toEqual(['a', 'b']);
		expect(state.resolved).toEqual([]);
		expect(state.exportText).toContain('first report');
		expect(toasts.items).toEqual([{ kind: 'error', text: 'Bug report not found' }]);
	});

	it('ignores a second resolve while one is in flight, and clears the pending id', async () => {
		const toasts = memoryToasts();
		const gate = Promise.withResolvers<void>();
		const settled = gate.promise;
		const api: FeedbackRegisterApi & { calls: string[] } = {
			calls: [],
			resolveBugReport: async (id) => {
				api.calls.push(`bug:${id}`);
				await settled;
				return OK;
			},
			resolveUnmatchedPhrase: async () => OK
		};
		const state = new FeedbackBugRegisterState(api, toasts, bugRegister(), NOW, ZONE);

		const first = state.resolve('a');
		expect(state.pendingId).toBe('a');
		await state.resolve('b');
		expect(api.calls).toEqual(['bug:a']);

		gate.resolve();
		await first;
		expect(state.pendingId).toBeNull();
		expect(state.open.map((row) => row.id)).toEqual(['b']);
	});

	it('carries the download date in the page’s zone', () => {
		const state = new FeedbackBugRegisterState(
			fakeApi(OK),
			memoryToasts(),
			bugRegister(),
			NOW,
			ZONE
		);
		expect(state.today).toBe('2026-11-21');
	});
});

describe('FeedbackPhraseRegisterState', () => {
	it('moves the resolved phrase out of the open list and out of the export', async () => {
		const toasts = memoryToasts();
		const state = new FeedbackPhraseRegisterState(
			fakeApi(OK),
			toasts,
			phraseRegister(),
			NOW,
			ZONE
		);
		expect(state.exportText).toContain('"call mom"');

		await state.resolve('p1');

		expect(state.open.map((row) => row.id)).toEqual(['p2']);
		expect(state.resolved.map((row) => [row.id, row.resolved, row.updatedAt])).toEqual([
			['p1', true, NOW]
		]);
		expect(state.exportText).not.toContain('"call mom"');
		expect(state.exportText).toContain('Open: 1 unique (2 occurrences)');
		expect(toasts.items).toEqual([{ kind: 'success', text: 'Resolved' }]);
	});

	it('rolls back and explains when the server refuses', async () => {
		const toasts = memoryToasts();
		const api = fakeApi({ ok: false, status: 404, error: 'Phrase not found' });
		const state = new FeedbackPhraseRegisterState(api, toasts, phraseRegister(), NOW, ZONE);

		await state.resolve('p2');

		expect(state.open.map((row) => row.id)).toEqual(['p1', 'p2']);
		expect(state.resolved).toEqual([]);
		expect(state.exportText).toContain('"dinner at six"');
		expect(toasts.items).toEqual([{ kind: 'error', text: 'Phrase not found' }]);
	});
});
