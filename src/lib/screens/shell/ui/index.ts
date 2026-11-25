/**
 * shell — public components: the root chrome, the group frame and the error
 * card. Every other component is internal to this module (a screen may not be
 * imported by another screen, so nothing else would ever consume them).
 *
 * Route files import the component FILES directly (`ui/ShellRoot.svelte`,
 * `ui/ShellGroupFrame.svelte`, `ui/ShellErrorView.svelte`), never this entry:
 * it re-exports all three, so a route that wants one paid for the others —
 * measured as the app chrome riding every page's eager error-node preload,
 * which is about 20 KB gzip on a phone (ADR 0010). The entry stays the
 * module's public surface for anything that needs more than one component.
 *
 * Doc: ../README.md#public-interface
 */
export { default as ShellRoot } from './ShellRoot.svelte';
export { default as ShellGroupFrame } from './ShellGroupFrame.svelte';
export { default as ShellErrorView } from './ShellErrorView.svelte';
