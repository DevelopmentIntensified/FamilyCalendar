/**
 * dayDashboard http: the page load behind `/calendar/dashboard` and its
 * `/api/dashboard` twin (G8).
 *
 * Both go through the ONE composition (`loadDayDashboard`), so the resolved
 * page payload and the API body cannot disagree: the API awaits the streamed
 * promise, strips the legs' warning labels out of `data` and merges them after
 * the page's own labels — legacy's exact order and shape.
 *
 * `?date=` is the contract's regex-only query (ten-digit `YYYY-MM-DD` or
 * nothing); a well-formed but impossible date passes here and falls back to
 * today in the service, exactly as the legacy route did.
 *
 * The page takes the layout's roster and Default View from `parent()` and
 * starts the viewer's category read before awaiting it (legacy #283), so the
 * two overlap; the API reads both itself.
 *
 * Doc: ./README.md#invariants
 */
import { endpoint, ok } from '$lib/kernel/http/endpoint.server';
import { pageLoad } from '$lib/kernel/http/pageHandlers.server';
import { listTaskCategories } from '$lib/domains/tasks/index.server';
import {
	DashboardDayQuery,
	type DashboardLoadedData,
	type DashboardModel,
	type DashboardRosterRow,
	type DashboardTaskCategoryRow
} from './dayDashboard.contract';
import { loadDayDashboard } from './dayDashboard.service.server';

/** What the calendar group layout hands its pages (`parent()`), as this page reads it. */
type DashboardLayoutData = {
	readonly userSettings?: { readonly defaultView?: string | null } | null;
	readonly familyMembers?: readonly DashboardRosterRow[] | null;
};

/**
 * `GET /calendar/dashboard?date=` — the page load. A missing session redirects
 * to `/login` (kernel `pageLoad`), never a 401; the API twin answers 401.
 */
export const loadDayDashboardPage = pageLoad({
	auth: 'user',
	handle: async ({ ctx, actor, event }) => {
		// Started first so it overlaps the parent() read (#283); never throws.
		const categoriesP: Promise<DashboardTaskCategoryRow[]> = listTaskCategories(ctx, actor)
			.then((rows) => rows.map((row) => ({ id: row.id, name: row.name })))
			.catch(() => []);
		const parent = (await event.parent()) as DashboardLayoutData;
		const page = await loadDayDashboard(ctx, actor, {
			date: event.url.searchParams.get('date'),
			categoriesP,
			familyMembers: parent.familyMembers ?? null
		});
		return {
			...page,
			defaultView: parent.userSettings?.defaultView ?? null
		};
	}
});

/**
 * `GET /api/dashboard?date=` (G8, Android) — the same composition, resolved:
 * the header, the ten legs in `data`, and one merged `warnings` list.
 */
export const getDayDashboard = endpoint({
	auth: 'user',
	query: DashboardDayQuery,
	handle: async ({ ctx, actor, query }) => {
		const page = await loadDayDashboard(ctx, actor, { date: query.date ?? null });
		const loaded: DashboardLoadedData = await page.data;
		const { warnings, ...data } = loaded;
		const body: DashboardModel = {
			zone: page.zone,
			dayISO: page.dayISO,
			isToday: page.isToday,
			meId: page.meId,
			familyId: page.familyId,
			modules: page.modules,
			taskCategories: page.taskCategories,
			data,
			warnings: [...page.loadWarnings, ...warnings]
		};
		return ok(body);
	}
});
