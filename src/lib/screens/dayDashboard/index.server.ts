/**
 * dayDashboard — public server interface: the composition service and the two
 * handlers (the page load and the `/api/dashboard` endpoint).
 * Doc: ./README.md#public-interface
 */
export {
	loadDayDashboard,
	type DayDashboardInput
} from './dayDashboard.service.server';
export { getDayDashboard, loadDayDashboardPage } from './dayDashboard.http.server';
