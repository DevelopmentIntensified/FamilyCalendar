/**
 * shell — public isomorphic interface: contract types, pure rules, client api.
 * Other modules import shell ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export type { ShellNavItem } from './shell.nav.rules';
export { shellActiveHref, shellNavItems } from './shell.nav.rules';
export { shellChromeForRoute } from './shell.frame.rules';
export { shellErrorView } from './shell.error.rules';
export type { ShellNoticeModel, ShellRootModel, ShellScopeModel } from './shell.contract';
