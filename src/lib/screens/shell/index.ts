/**
 * shell — public isomorphic interface: contract types, pure rules and the one
 * ports wiring point. Other modules import shell ONLY through this file,
 * index.server.ts or ui/index.ts (rule R2).
 *
 * `createShellPorts()` is exported because the route files (the root and the
 * group layouts) are its only callers, and a route imports a module through its
 * public entries.
 *
 * Doc: ./README.md#public-interface
 */
export type { ShellNavItem } from './shell.nav.rules';
export { shellActiveHref, shellNavItems } from './shell.nav.rules';
export { shellChromeForRoute } from './shell.frame.rules';
export { shellErrorView } from './shell.error.rules';
export { createShellPorts } from './shell.api';
export type {
	ShellFrameScope,
	ShellNoticeModel,
	ShellRootModel,
	ShellScopeModel
} from './shell.contract';
