/**
 * TRANSITION BRIDGE (dashboardModules S8, 2026-11-21).
 *
 * The only remaining caller is the unported family-hub page
 * (`src/routes/(family)/family/[familyId]/+page.svelte`), and a `+page.svelte`
 * that imports ported code must be wiring-only (rule R8) — it is not yet. This
 * file therefore keeps the one name that page reads and derives it from the
 * module's public entry, so the registry still has one home. Delete this file
 * with the family page's rebuild (screen `familyHub`, S8).
 */
import { selectDashboardModules } from '$lib/domains/dashboardModules';

/** The modules that carry a family master switch — the family page's band. */
export const FAMILY_DASHBOARD_MODULES = selectDashboardModules({ scope: 'family' });
