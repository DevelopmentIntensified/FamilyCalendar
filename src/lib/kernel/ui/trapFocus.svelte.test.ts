/**
 * The focus trap moved out of the legacy `$lib/utils/focusTrap.ts`: Tab and
 * Shift+Tab cycle inside the node and focus returns to whoever had it before.
 *
 * Doc: src/lib/kernel/README.md
 */
import { describe, it, expect, afterEach } from 'vitest';
import { trapFocus } from './trapFocus';

let cleanups: { destroy(): void }[] = [];

afterEach(() => {
	for (const cleanup of cleanups) cleanup.destroy();
	cleanups = [];
	document.body.innerHTML = '';
});

function mountPanel() {
	const panel = document.createElement('div');
	panel.innerHTML = '<button type="button">First</button><button type="button">Last</button>';
	document.body.appendChild(panel);
	return {
		panel,
		first: panel.querySelectorAll('button')[0],
		last: panel.querySelectorAll('button')[1]
	};
}

function pressTab(target: Element, shiftKey = false) {
	const event = new KeyboardEvent('keydown', {
		key: 'Tab',
		shiftKey,
		bubbles: true,
		cancelable: true
	});
	target.dispatchEvent(event);
	return event;
}

describe('trapFocus', () => {
	it('wraps Tab from the last focusable to the first and back with Shift+Tab', () => {
		const { panel, first, last } = mountPanel();
		cleanups.push(trapFocus(panel));
		// The action already moved focus onto the first control.
		expect(document.activeElement).toBe(first);

		last.focus();
		const forward = pressTab(panel);
		expect(forward.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(first);

		const backward = pressTab(panel, true);
		expect(backward.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(last);
	});

	it('lets Tab from the first control continue natively, and ignores other keys', () => {
		const { panel, first } = mountPanel();
		cleanups.push(trapFocus(panel));

		first.focus();
		expect(pressTab(first).defaultPrevented).toBe(false);

		const other = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
		first.dispatchEvent(other);
		expect(other.defaultPrevented).toBe(false);
		expect(document.activeElement).toBe(first);
	});

	it('restores the previously focused element on destroy', () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Open';
		document.body.appendChild(trigger);
		trigger.focus();

		const { panel, first } = mountPanel();
		const action = trapFocus(panel);
		expect(document.activeElement).toBe(first);

		action.destroy();
		expect(document.activeElement).toBe(trigger);

		// The listener goes with it: Tab from the last control no longer wraps.
		const event = pressTab(first);
		expect(event.defaultPrevented).toBe(false);
	});

	it('cycles only through controls that can actually take focus', () => {
		// Every unreachable control sits AFTER "Last": if the trap counted one of
		// them as the last stop, Tab from "Last" would not wrap.
		const panel = document.createElement('div');
		panel.innerHTML = [
			'<button type="button" data-edge="first">First</button>',
			'<button type="button" disabled>Disabled</button>',
			'<div hidden><button type="button">Hidden</button></div>',
			'<div inert><button type="button">Inert</button></div>',
			'<button type="button" data-edge="last">Last</button>',
			'<button type="button" disabled>Trailing disabled</button>',
			'<div hidden><button type="button">Trailing hidden</button></div>',
			'<div inert><button type="button">Trailing inert</button></div>',
			'<input type="hidden" name="secret" value="1" />'
		].join('');
		document.body.appendChild(panel);
		cleanups.push(trapFocus(panel));

		const first = panel.querySelector<HTMLButtonElement>('[data-edge="first"]');
		const last = panel.querySelector<HTMLButtonElement>('[data-edge="last"]');
		if (!first || !last) throw new Error('missing edge controls');
		expect(document.activeElement).toBe(first);

		last.focus();
		const forward = pressTab(panel);
		expect(forward.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(first);

		const backward = pressTab(panel, true);
		expect(backward.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(last);
	});
});
