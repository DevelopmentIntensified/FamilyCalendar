/**
 * admin — public server interface: services and http handlers.
 * Doc: ./README.md#public-interface
 */
export { adminCountsEndpoint, adminLayoutLoad } from './admin.http.server';
export { getAdminCounts } from './admin.service.server';
