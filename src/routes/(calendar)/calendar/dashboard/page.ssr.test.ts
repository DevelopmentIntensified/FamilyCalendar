import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { readable, writable } from 'svelte/store';
import Root from '../../../../../.svelte-kit/generated/root.svelte';
import RootLayout from '../../../+layout.svelte';
import CalendarLayout from '../+layout.svelte';
import DashboardPage from './+page.svelte';
import { dashboardVisibility } from '$lib/dashboardModules';

/**
 * #278/#279: server-render /calendar/dashboard the way SvelteKit does —
 * generated root, the real layout chain (root → calendar → page), the kit
 * `__svelte__` stores context and `__request__` page context — with every
 * module on and realistic data. A store read outside component init, or any
 * render path that runs with no SSR component context, throws here.
 */

const user = {
	id: 'u-sarah',
	email: 'sarah@example.com',
	name: 'Sarah Rivera',
	firstName: 'Sarah',
	lastName: 'Rivera',
	emailVerified: true,
	isAnonymous: false,
	lastActiveAt: new Date('2026-10-27T10:00:00Z'),
	roles: ['user']
};

const members = [
	{ userId: 'u-sarah', firstName: 'Sarah', lastName: 'Rivera', email: 'sarah@example.com' },
	{ userId: 'u-tom', firstName: 'Tom', lastName: 'Rivera', email: 'tom@example.com' },
	{ userId: 'k-ella', firstName: 'Ella', lastName: 'Rivera', email: null }
];

type TaskOverrides = { priority?: string; assignedTo?: string | null; completedAt?: string };

const task = (id: string, extra: TaskOverrides = {}) => ({
	id,
	title: `Task ${id}`,
	dueDate: '2026-10-27T15:00:00.000Z',
	completedAt: null,
	priority: 'high',
	assignedTo: 'u-sarah',
	assignmentStatus: 'accepted',
	userId: 'u-sarah',
	familyId: 'f-rivera',
	...extra
});

const dashboardResult = {
	glance: { doneToday: 2, openToday: 3, weekStreak: 4 },
	dayEvents: [
		{
			id: 'e1',
			title: 'Soccer practice',
			start: '2026-10-27T21:00:00.000Z',
			end: '2026-10-27T22:00:00.000Z',
			allDay: false,
			location: 'Field 3'
		},
		{
			id: 'e2',
			title: 'Pumpkin day',
			start: '2026-10-27T00:00:00.000Z',
			end: null,
			allDay: true,
			location: null
		}
	],
	top3: [task('a'), task('b', { priority: 'normal' }), task('c', { priority: 'low' })],
	completedToday: [{ ...task('d'), completedAt: '2026-10-27T13:00:00.000Z' }],
	familyTasks: [task('e', { assignedTo: 'u-tom' }), task('f', { assignedTo: null })],
	familyMembers: members,
	kidsSchedule: [
		{
			id: 'e1',
			title: 'Soccer practice',
			start: '2026-10-27T21:00:00.000Z',
			end: '2026-10-27T22:00:00.000Z',
			allDay: false,
			location: 'Field 3',
			kids: [{ id: 'k-ella', name: 'Ella' }]
		}
	],
	familyGroceries: [{ name: 'Milk', stores: ['Costco'] }],
	mineGroceries: [{ name: 'Coffee', stores: [] }],
	warnings: []
};

type DashboardResult = typeof dashboardResult;

/** Streamed (a promise, as the loader returns it) or already resolved. */
function ssrDashboard(dashboardData: DashboardResult | Promise<DashboardResult>, search = '') {
	const userSettings = {
		defaultView: 'dashboard',
		timeZone: 'America/New_York',
		showDailyVerse: true,
		hiddenDashboardModules: []
	};
	const modules = dashboardVisibility({ settings: userSettings, familySwitches: {} }).modules;
	const layoutData = {
		pathname: '/calendar/dashboard',
		isLoggedIn: true,
		user,
		userSettings,
		familyId: 'f-rivera',
		familyMembers: members
	};
	const pageData = {
		...layoutData,
		zone: 'America/New_York',
		dayISO: '2026-10-27T00:00:00.000-04:00',
		isToday: true,
		meId: 'u-sarah',
		modules,
		dashboardData,
		dailyVerse: {
			reference: 'Psalm 127:1',
			text: 'Except the LORD build the house, they labour in vain.',
			attribution: 'ESV'
		},
		loadWarnings: []
	};
	const page = {
		error: null,
		params: {},
		route: { id: '/(calendar)/calendar/dashboard' },
		status: 200,
		url: new URL(`https://www.familyplanz.com/calendar/dashboard${search}`),
		data: pageData,
		form: undefined,
		state: {}
	};
	// Kit's server stores (runtime/server/page/render.js): a notifiable page
	// store, a navigating store, and the `updated` store.
	const pageStore = writable(page);
	const stores = {
		page: { ...pageStore, notify: () => {} },
		navigating: writable(null),
		updated: { ...readable(false), check: () => Promise.resolve(false) }
	};
	return render(Root, {
		props: {
			stores,
			page,
			constructors: [RootLayout, CalendarLayout, DashboardPage],
			components: [],
			form: undefined,
			data_0: {},
			data_1: layoutData,
			data_2: pageData
		},
		context: new Map([['__request__', { page }]])
	});
}

describe('/calendar/dashboard server render (#278, #279)', () => {
	it('renders the streamed (pending) shell with the nav chrome', () => {
		const { body } = ssrDashboard(Promise.resolve(dashboardResult));
		expect(body).toContain('Day Dashboard');
		expect(body).toContain('data-testid="daynav"');
		expect(body).toContain('animate-pulse');
	});

	it('renders every module card when the dashboard data is already resolved', () => {
		const { body } = ssrDashboard(dashboardResult);
		expect(body).toContain('Today at a Glance');
		expect(body).toContain('Soccer practice');
		expect(body).toContain('Task a');
		expect(body).toContain('Milk');
		expect(body).toContain('Except the LORD build the house');
	});

	// The dev-only prototype reflow (208) renders under `vite dev` (PROD
	// false) — the only server where #278/#279's messages can exist.
	it.each(['A', 'B', 'C'])('renders the dev prototype variant %s', (v) => {
		const { body } = ssrDashboard(dashboardResult, `?variant=${v}`);
		expect(body).toContain('Day Dashboard');
		expect(body).toContain('Soccer practice');
	});

	it('survives two renders back to back (no context leaks between requests)', () => {
		ssrDashboard(dashboardResult);
		const { body } = ssrDashboard(Promise.resolve(dashboardResult), '?date=2026-10-28');
		expect(body).toContain('Day Dashboard');
	});
});
