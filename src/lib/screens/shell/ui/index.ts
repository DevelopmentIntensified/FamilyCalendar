/**
 * shell — public components: the root chrome, the group frame and the error
 * card. Every other component is internal to this module (a screen may not be
 * imported by another screen, so nothing else would ever consume them).
 *
 * Doc: ../README.md#public-interface
 */
export { default as ShellRoot } from './ShellRoot.svelte';
export { default as ShellGroupFrame } from './ShellGroupFrame.svelte';
export { default as ShellErrorView } from './ShellErrorView.svelte';
