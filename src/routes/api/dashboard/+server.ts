/**
 * GET /api/dashboard?date= — the Day Dashboard payload (G8), the same
 * composition the page load runs. The handler lives in the screen's http
 * module; this file only maps the URL to it.
 */
import { getDayDashboard } from '$lib/screens/dayDashboard/index.server';

export const GET = getDayDashboard.handler;
