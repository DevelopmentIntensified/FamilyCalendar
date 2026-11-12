/**
 * Focus trap for dialogs and sheets, moved out of the legacy
 * `$lib/utils/focusTrap.ts` as a Svelte action: Tab and Shift+Tab cycle inside
 * the node, the first control takes focus on mount, and destroy hands focus
 * back to whoever had it before (so closing a sheet returns the user to the
 * button that opened it).
 *
 * This is a Svelte action, not a component: `use:trapFocus`.
 *
 * Doc: src/lib/kernel/README.md
 */

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), textarea, input:not([type="hidden"]), select, [tabindex]:not([tabindex="-1"])';

/**
 * Subtrees that cannot take focus but whose controls still match the selector:
 * a disabled fieldset, a `hidden` block, an `inert` panel. Asked of the DOM tree
 * on purpose — layout APIs (`offsetParent`, `getClientRects`) tell nothing in
 * jsdom, where these tests run.
 */
const UNFOCUSABLE_SUBTREE = '[disabled], [hidden], [inert]';

export function trapFocus(node: HTMLElement): { destroy(): void } {
	const previouslyFocused =
		document.activeElement instanceof HTMLElement ? document.activeElement : null;

	const focusables = (): HTMLElement[] =>
		Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
			(element) => element.closest(UNFOCUSABLE_SUBTREE) === null
		);

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;

		const items = focusables();
		if (items.length === 0) return;

		const first = items[0];
		const last = items[items.length - 1];
		const current = document.activeElement;
		const inside = current instanceof Node && node.contains(current);

		if (event.shiftKey) {
			if (!inside || current === first) {
				event.preventDefault();
				last.focus();
			}
		} else if (!inside || current === last) {
			event.preventDefault();
			first.focus();
		}
	}

	// A panel that is itself focusable (tabindex="-1") keeps focus while the
	// first Tab moves on to its controls; otherwise start on the first control.
	const initialTarget =
		node.getAttribute('tabindex') === '-1' ? node : (focusables()[0] ?? null);
	initialTarget?.focus();

	node.addEventListener('keydown', handleKeydown);

	return {
		destroy() {
			node.removeEventListener('keydown', handleKeydown);
			if (previouslyFocused?.isConnected) previouslyFocused.focus();
		}
	};
}
