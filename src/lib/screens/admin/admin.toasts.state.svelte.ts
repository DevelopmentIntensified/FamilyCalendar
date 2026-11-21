/**
 * admin toasts: the one toast list every admin page shares.
 *
 * `AdminShell` mounts kernel/ui's `Toaster` over this list and the register
 * pages and their export panel push into it, so the area keeps a single live
 * region and a page never grows a second toaster. Legacy was the same thing
 * one module down (`$lib/client/toasts.ts` exported one list and `pushToast()`;
 * the `(admin)` layout rendered `<Toaster />`), now on the kernel's runes
 * store. Nothing pushes during SSR — toasts are browser interaction feedback —
 * so one module-level list is safe on the server too.
 *
 * Doc: ./README.md#public-interface
 */
import { createToasts } from '$lib/kernel/client/toasts.svelte';

/** The admin area's toast list: the shell renders it, the pages report into it. */
export const adminToasts = createToasts();
