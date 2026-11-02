import { describe, it, expect, vi } from 'vitest';
import { nudgeEventsChanged, type NudgeDeps } from './eventsChangedNudge';

function makeDeps(over: Partial<NudgeDeps> = {}) {
	const deps = {
		isConfigured: vi.fn(() => true),
		accessibleCalendarIds: vi.fn(async () => ['cal-personal', 'cal-family']),
		calendarAudience: vi.fn(async (calendarIds: string[]) => {
			const map: Record<string, string[]> = {
				'cal-personal': ['actor'],
				'cal-family': ['actor', 'spouse', 'kid'],
				'cal-other': ['other-owner', 'spouse']
			};
			return calendarIds.flatMap((id) => map[id] ?? []);
		}),
		sendDataToUsers: vi.fn(async (_users: string[], _data: { type: 'events_changed' }) => {}),
		...over
	} satisfies NudgeDeps;
	return deps;
}

describe('nudgeEventsChanged', () => {
	it('sends ONE events_changed to the deduped audience of every calendar touched', async () => {
		const deps = makeDeps();

		await nudgeEventsChanged('actor', ['cal-other', 'cal-family', null], deps);

		expect(deps.calendarAudience).toHaveBeenCalledTimes(1);
		expect(new Set(vi.mocked(deps.calendarAudience).mock.calls[0][0])).toEqual(
			new Set(['cal-other', 'cal-family', 'cal-personal'])
		);
		expect(deps.sendDataToUsers).toHaveBeenCalledTimes(1);
		const [users, data] = vi.mocked(deps.sendDataToUsers).mock.calls[0];
		expect([...users].sort()).toEqual(['actor', 'kid', 'other-owner', 'spouse']);
		expect(new Set(users).size).toBe(users.length);
		expect(data).toEqual({ type: 'events_changed' });
	});

	it("always includes the actor and the actor's accessible calendars (family mirrors)", async () => {
		const deps = makeDeps({ calendarAudience: vi.fn(async () => []) });
		await nudgeEventsChanged('actor', [], deps);
		expect(deps.accessibleCalendarIds).toHaveBeenCalledWith('actor');
		expect(deps.sendDataToUsers).toHaveBeenCalledWith(['actor'], { type: 'events_changed' });
	});

	it('is a synchronous no-op when FCM is not configured (no db work)', async () => {
		const deps = makeDeps({ isConfigured: vi.fn(() => false) });
		await nudgeEventsChanged('actor', ['cal-family'], deps);
		expect(deps.accessibleCalendarIds).not.toHaveBeenCalled();
		expect(deps.calendarAudience).not.toHaveBeenCalled();
		expect(deps.sendDataToUsers).not.toHaveBeenCalled();
	});

	it('returns before the audience lookup finishes (fire-and-forget) and never rejects', async () => {
		let release: () => void = () => {};
		const deps = makeDeps({
			accessibleCalendarIds: vi.fn(
				() =>
					new Promise<string[]>((resolve) => {
						release = () => resolve([]);
					})
			)
		});
		const pending = nudgeEventsChanged('actor', [], deps);
		expect(deps.sendDataToUsers).not.toHaveBeenCalled();
		release();
		await pending;
		expect(deps.sendDataToUsers).toHaveBeenCalledOnce();

		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failing = makeDeps({
			calendarAudience: vi.fn(async () => {
				throw new Error('db down');
			})
		});
		await expect(nudgeEventsChanged('actor', [], failing)).resolves.toBeUndefined();
		expect(failing.sendDataToUsers).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});
