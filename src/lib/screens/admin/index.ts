/**
 * admin — public isomorphic interface: contract types, pure rules, client api.
 * Other modules import admin ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export { AdminCounts } from './admin.contract';
export { ADMIN_SECTIONS, isAdminSectionActive, type AdminSection } from './admin.sections.rules';
