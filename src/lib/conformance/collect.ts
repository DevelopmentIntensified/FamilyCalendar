import type { Measurement } from './tokens';

/**
 * 131 — the in-page collector.
 *
 * Walks the rendered document and records one Measurement per element per
 * property, pruned to what a person can actually see. It runs INSIDE the page
 * through page.evaluate, so it stays self-contained: Playwright serialises the
 * function source, and anything it closes over would not survive.
 */
export function collectMeasurements(props: string[]): Measurement[] {
	const out: Measurement[] = [];

	const selector = (el: Element): string => {
		if (el === document.body) return 'body';
		const parts: string[] = [];
		let node: Element | null = el;
		while (node && node !== document.body && parts.length < 6) {
			let part = node.tagName.toLowerCase();
			if (node.id) {
				parts.unshift(`${part}#${node.id}`);
				break;
			}
			const testid = node.getAttribute('data-testid');
			if (testid) {
				parts.unshift(`${part}[data-testid="${testid}"]`);
				break;
			}
			const classes = (node.getAttribute('class') ?? '')
				.trim()
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 2);
			if (classes.length > 0) part += `.${classes.join('.')}`;
			parts.unshift(part);
			node = node.parentElement;
		}
		return parts.join(' > ');
	};

	const walk = (el: Element): void => {
		if (!(el instanceof HTMLElement)) return;
		const cs = getComputedStyle(el);
		if (cs.display === 'none' || cs.visibility === 'hidden') return;
		const path = selector(el);
		for (const property of props) {
			const value = cs.getPropertyValue(property);
			if (value) out.push({ selector: path, property, value });
		}
		const children = el.children;
		for (let i = 0; i < children.length; i += 1) walk(children[i]);
	};

	if (document.body) walk(document.body);
	return out;
}
