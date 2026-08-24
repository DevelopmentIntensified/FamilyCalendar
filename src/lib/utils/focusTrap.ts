const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function trapFocus(container: HTMLElement): () => void {
	const previouslyFocused =
		document.activeElement instanceof HTMLElement ? document.activeElement : null;

	function getFocusables(): HTMLElement[] {
		return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;

		const focusables = getFocusables();
		if (focusables.length === 0) return;

		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const current = document.activeElement;
		const insideContainer = current instanceof Node && container.contains(current);

		if (event.shiftKey) {
			if (!insideContainer || current === first) {
				event.preventDefault();
				last.focus();
			}
		} else if (!insideContainer || current === last) {
			event.preventDefault();
			first.focus();
		}
	}

	const initialTarget =
		container.getAttribute('tabindex') === '-1' ? container : getFocusables()[0] ?? null;
	initialTarget?.focus();

	container.addEventListener('keydown', handleKeydown);

	return () => {
		container.removeEventListener('keydown', handleKeydown);
		if (previouslyFocused?.isConnected) {
			previouslyFocused.focus();
		}
	};
}

export function trapFocusAction(node: HTMLElement) {
	return { destroy: trapFocus(node) };
}
