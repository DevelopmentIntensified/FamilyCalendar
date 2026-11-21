/**
 * shell — public server interface: the services the root and calendar layouts
 * wire, and the `pageLoad()` handlers behind them.
 *
 * Shell owns no table and no query of its own: this entry re-exports the two
 * use-cases, which compose identity's and family's public server reads.
 *
 * Doc: ./README.md#public-interface
 */

export { loadCalendarGroup, loadShellRoot } from './shell.service.server';
export { shellCalendarGroupLoad, shellRootLoad } from './shell.http.server';
