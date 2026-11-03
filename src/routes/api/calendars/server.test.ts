import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calendars, families } from '$lib/server/db/schema';

/**
 * GET /api/calendars (#292 G2): personal first ("Personal Calendar",
 * settings colour else #fa8072), then the family calendar (family name +
 * colour else #e0ffff). The DB seam is a per-table scripted stub.
 */
const rows = vi.hoisted(() => ({ byTable: new Map<unknown, unknown[]>() }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- per-table scripted drizzle stub; the naming/colour rules under test stay real.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: (table: unknown) => ({ where: async () => rows.byTable.get(table) ?? [] })
		})
	}
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam (insert-or-read of the personal calendar).
vi.mock('$lib/server/db/actions/calendar', () => ({
	ensurePersonalCalendar: vi.fn(async () => ({ id: 'cal-me' }))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; reads user_settings.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => ({ color: '#123456' }))
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; reads familyMembers.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => 'fam-1')
}));

import { GET } from './+server';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { getUserFamilyId } from '$lib/server/db/actions/families';

function ev(user: { id: string } | null) {
	// SAFETY: test double — the handler reads locals.user only.
	return { locals: { user } } as never;
}

beforeEach(() => {
	rows.byTable = new Map<unknown, unknown[]>([
		[families, [{ id: 'fam-1', name: 'Riveras', color: '#00ff00' }]],
		[calendars, [{ id: 'cal-fam', familyId: 'fam-1' }]]
	]);
});

describe('GET /api/calendars (G2)', () => {
	it('401 without auth', async () => {
		const res = await GET(ev(null));
		expect(res.status).toBe(401);
	});

	it('personal first, then the family calendar, named + coloured like the page', async () => {
		const res = await GET(ev({ id: 'user-1' }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			calendars: [
				{ id: 'cal-me', name: 'Personal Calendar', color: '#123456', kind: 'personal' },
				{ id: 'cal-fam', name: 'Riveras', color: '#00ff00', kind: 'family' }
			]
		});
	});

	it('falls back to the default colours', async () => {
		vi.mocked(getUserSettings).mockResolvedValueOnce(undefined as never);
		rows.byTable.set(families, [{ id: 'fam-1', name: 'Riveras', color: null }]);
		const body = await (await GET(ev({ id: 'user-1' }))).json();
		expect(body.calendars.map((c: { color: string }) => c.color)).toEqual(['#fa8072', '#e0ffff']);
	});

	it('no family → personal only', async () => {
		vi.mocked(getUserFamilyId).mockResolvedValueOnce(null);
		const body = await (await GET(ev({ id: 'user-1' }))).json();
		expect(body.calendars).toHaveLength(1);
		expect(body.calendars[0].kind).toBe('personal');
	});

	it('a family with no calendar row yet → personal only', async () => {
		rows.byTable.set(calendars, []);
		const body = await (await GET(ev({ id: 'user-1' }))).json();
		expect(body.calendars.map((c: { kind: string }) => c.kind)).toEqual(['personal']);
	});
});
