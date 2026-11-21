/**
 * dayDashboard — public isomorphic interface: the one type tree the cards and
 * the `/api/dashboard` body share. No logic, no schemas: the zod contract lives
 * in `dayDashboard.contract.ts`.
 * Other modules import dayDashboard ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export type {
	DashboardData,
	DashboardModel,
	DashboardPageData
} from './dayDashboard.contract';
