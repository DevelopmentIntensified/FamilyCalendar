/**
 * The mention textarea: what it shows, and what it reports. Kernel ui; see
 * [../README.md](../README.md).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import MentionInput from './MentionInput.svelte';
import type { MentionEveryoneOption, MentionPerson } from './mentionFilter';

const PEOPLE: MentionPerson[] = [
	{ id: 'u-sam', firstName: 'Sam', lastName: 'Rivera' },
	{ id: 'u-mom', firstName: 'Mom', lastName: '' },
	{ id: 'u-dad', firstName: 'Dad', lastName: 'Chen' }
];

/** The caller's group row: kernel owns no group words, so a family screen passes these. */
const FAMILY: MentionEveryoneOption = {
	header: 'Family',
	insert: '@family',
	label: 'Everyone',
	handle: '@family · the whole family',
	glyph: '👪'
};

afterEach(cleanup);

/** Svelte 5 paints on a microtask; DOM reads wait one beat after a state change. */
function flush(): Promise<void> {
	return tick();
}

/** The component renders exactly one native `<textarea>`; missing it is a harness bug. */
function inputElement(container: HTMLElement): HTMLTextAreaElement {
	const input = container.querySelector('textarea');
	if (!(input instanceof HTMLTextAreaElement)) throw new Error('missing input element');
	return input;
}

describe('MentionInput', () => {
	it('renders a single native textarea and forwards passthrough props', () => {
		const { container } = render(MentionInput, {
			props: {
				value: 'hello',
				people: PEOPLE,
				placeholder: 'Add a task…',
				'aria-label': 'Quick add',
				class: 'harness-input',
				id: 'quick-add'
			}
		});
		const input = inputElement(container);
		expect(input.value).toBe('hello');
		expect(input).toHaveProperty('placeholder', 'Add a task…');
		expect(input).toHaveAttribute('aria-label', 'Quick add');
		expect(input).toHaveAttribute('id', 'quick-add');
		expect(input.classList.contains('harness-input')).toBe(true);
		// The look-and-feel class goes on the input, not the wrapper.
		const wrapper = container.firstElementChild;
		expect(wrapper?.classList.contains('harness-input')).toBe(false);
	});

	it('takes an optional test id, so two pickers on one page never collide', () => {
		const quickAdd = render(MentionInput, { props: { testid: 'quick-add' } });
		const editTask = render(MentionInput, { props: { testid: 'edit-task' } });
		expect(quickAdd.getByTestId('quick-add').tagName).toBe('TEXTAREA');
		expect(editTask.getByTestId('edit-task').tagName).toBe('TEXTAREA');
		// The default keeps a single picker addressable without passing anything.
		cleanup();
		expect(render(MentionInput).getByTestId('mention-input').tagName).toBe('TEXTAREA');
	});

	it('never shows suggestions when there is no roster', async () => {
		const { container } = render(MentionInput, { props: { value: '@', people: [] } });
		const input = inputElement(container);
		await fireEvent.focus(input);
		await fireEvent.input(input, { target: { value: '@sa' } });
		await flush();
		expect(container.querySelector('[role="listbox"]')).toBeNull();
	});

	it('opens a listbox for an in-progress mention and closes it without one', async () => {
		const { container } = render(MentionInput, {
			props: { value: 'buy @sa', people: PEOPLE }
		});
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		expect(container.querySelector('[role="listbox"]')).not.toBeNull();
		expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
		expect(container.textContent).toContain('Sam Rivera');

		// A real keystroke replaces the mention with no fragment at all.
		await fireEvent.input(input, { target: { value: 'buy milk tomorrow' } });
		await flush();
		expect(container.querySelector('[role="listbox"]')).toBeNull();
	});

	it('lets the caller bind the value and maintains it across programmatic resets', async () => {
		const onchange = vi.fn();
		const { container, rerender } = render(MentionInput, { props: { people: PEOPLE, onchange } });
		const input = inputElement(container);
		await fireEvent.input(input, { target: { value: 'buy @sa' } });
		await flush();
		expect(input.value).toBe('buy @sa');
		expect(onchange).toHaveBeenLastCalledWith('buy @sa');

		// The caller owns the text: a reset arrives as a prop and the field follows.
		await rerender({ people: PEOPLE, onchange, value: 'cleared' });
		await flush();
		expect(input.value).toBe('cleared');
	});

	it('inserts the highlighted member (ArrowDown + Enter) and flows the built value back to the caller', async () => {
		const onchange = vi.fn();
		const { container } = render(MentionInput, {
			props: { value: 'buy @sa', people: PEOPLE, onchange }
		});
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		await fireEvent.keyDown(input, { key: 'Enter' });
		await flush();
		expect(onchange).toHaveBeenLastCalledWith('buy @Sam Rivera ');
		expect(input.value).toBe('buy @Sam Rivera ');
		// Dropdown closed after insertion.
		expect(container.querySelector('[role="listbox"]')).toBeNull();
	});

	it('inserts a full name at the start of the input without double spaces', async () => {
		const { container } = render(MentionInput, {
			props: { value: '@sa buy milk', people: PEOPLE }
		});
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		await fireEvent.keyDown(input, { key: 'Enter' });
		await flush();
		expect(input.value).toBe('@Sam Rivera buy milk');
	});

	it('prefers full "First Last" when the fragment equals a single member, and inserts first-name-only for members without a last name', async () => {
		const { container } = render(MentionInput, {
			props: { value: 'call @mom', people: PEOPLE }
		});
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		await fireEvent.keyDown(input, { key: 'Enter' });
		await flush();
		expect(input.value).toBe('call @Mom ');
	});

	it('closes on tab without submitting the surrounding form', async () => {
		const onsubmit = vi.fn();
		const { container } = render(MentionInput, {
			props: { value: 'buy @da', people: PEOPLE, onsubmit }
		});
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		expect(container.querySelector('[role="listbox"]')).not.toBeNull();
		await fireEvent.keyDown(input, { key: 'Tab' });
		await flush();
		expect(input.value).toBe('buy @Dad Chen ');
		expect(container.querySelector('[role="listbox"]')).toBeNull();
		expect(onsubmit).not.toHaveBeenCalled();
	});

	it('clicking an option inserts it without leaving the input', async () => {
		const { container } = render(MentionInput, { props: { value: 'buy @da', people: PEOPLE } });
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		const option = container.querySelector('[role="option"]');
		if (!(option instanceof HTMLElement)) throw new Error('missing option');
		await fireEvent.mouseDown(option);
		await fireEvent.click(option);
		await flush();
		expect(input.value).toBe('buy @Dad Chen ');
	});

	it('Escape closes the dropdown and keeps it closed for the same fragment until the next keystroke', async () => {
		const { container } = render(MentionInput, { props: { value: 'buy @da', people: PEOPLE } });
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		expect(container.querySelector('[role="listbox"]')).not.toBeNull();

		await fireEvent.keyDown(input, { key: 'Escape' });
		await flush();
		expect(container.querySelector('[role="listbox"]')).toBeNull();

		// Same fragment, no new keystroke (e.g. refocus or a second Enter) — stays closed.
		await fireEvent.focus(input);
		await flush();
		expect(container.querySelector('[role="listbox"]')).toBeNull();

		// A real keystroke lifts the lock.
		await fireEvent.input(input, { target: { value: 'buy @dad' } });
		await flush();
		expect(container.querySelector('[role="listbox"]')).not.toBeNull();
	});

	it('leaves a plain Enter alone with no dropdown, so a multi-line caller types its newline', async () => {
		const onsubmit = vi.fn();
		const { container } = render(MentionInput, {
			props: { value: 'buy milk', people: PEOPLE, onsubmit }
		});
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		expect(container.querySelector('[role="listbox"]')).toBeNull();

		// Legacy Enter: closed, the key is not ours. No preventDefault (the
		// textarea types the newline) and no submit — what the quick-add bulk
		// paste box needs.
		const enter = new KeyboardEvent('keydown', {
			key: 'Enter',
			bubbles: true,
			cancelable: true
		});
		input.dispatchEvent(enter);

		expect(enter.defaultPrevented).toBe(false);
		expect(onsubmit).not.toHaveBeenCalled();
	});

	it('leaves Enter and the arrows to the IME while a composition is in progress', async () => {
		const onsubmit = vi.fn();
		const { container } = render(MentionInput, {
			props: { value: 'buy @sa', people: PEOPLE, onsubmit }
		});
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		expect(container.querySelector('[role="listbox"]')).not.toBeNull();

		// jsdom ignores `isComposing` in KeyboardEventInit, so set the flag the
		// way a real IME keydown carries it.
		const composing = new KeyboardEvent('keydown', {
			key: 'Enter',
			bubbles: true,
			cancelable: true
		});
		Object.defineProperty(composing, 'isComposing', { value: true });
		input.dispatchEvent(composing);
		await flush();

		expect(composing.defaultPrevented).toBe(false);
		expect(input.value).toBe('buy @sa');
		expect(onsubmit).not.toHaveBeenCalled();
		expect(container.querySelector('[role="listbox"]')).not.toBeNull();
	});

	it('submits on Enter when the open list no longer has the highlighted row', async () => {
		const onsubmit = vi.fn();
		const { container, rerender } = render(MentionInput, {
			props: {
				value: 'buy @sa',
				people: [
					{ id: 'u-sam', firstName: 'Sam', lastName: '' },
					{ id: 'u-sara', firstName: 'Sara', lastName: '' }
				],
				onsubmit
			}
		});
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		// Highlight the second row, then let the roster shrink underneath it.
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		await rerender({
			value: 'buy @sa',
			people: [{ id: 'u-sam', firstName: 'Sam', lastName: '' }],
			onsubmit
		});
		await flush();
		expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);

		const enter = new KeyboardEvent('keydown', {
			key: 'Enter',
			bubbles: true,
			cancelable: true
		});
		input.dispatchEvent(enter);

		// Nothing highlighted to pick: the key still belongs to the picker, so the
		// newline is swallowed and the caller's submit runs.
		expect(enter.defaultPrevented).toBe(true);
		expect(onsubmit).toHaveBeenCalledTimes(1);
		expect(input.value).toBe('buy @sa');
	});

	it('Shift+Enter stays a newline', async () => {
		const onsubmit = vi.fn();
		const { container } = render(MentionInput, {
			props: { value: 'buy milk', people: PEOPLE, onsubmit }
		});
		const input = inputElement(container);
		await fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
		expect(onsubmit).not.toHaveBeenCalled();
	});

	it('shows the 👪 group row first when the fragment matches, Enter inserts its token', async () => {
		const { container } = render(MentionInput, {
			props: { value: 'buy @fam', people: PEOPLE, everyone: FAMILY }
		});
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		const options = container.querySelectorAll('[role="option"]');
		expect(options.length).toBeGreaterThanOrEqual(1);
		expect(options[0].textContent).toContain('@family');
		await fireEvent.keyDown(input, { key: 'Enter' });
		await flush();
		expect(input.value).toBe('buy @family ');
		expect(container.querySelector('[role="listbox"]')).toBeNull();
	});

	it('clicking the group row inserts its token', async () => {
		const { container } = render(MentionInput, {
			props: { value: 'buy @', people: PEOPLE, everyone: FAMILY }
		});
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		const option = container.querySelector('[role="option"]');
		if (!(option instanceof HTMLElement)) throw new Error('missing group option');
		expect(option.textContent).toContain('Everyone');
		await fireEvent.mouseDown(option);
		await fireEvent.click(option);
		await flush();
		expect(input.value).toBe('buy @family ');
	});

	it('member rows show a @handle subtitle', async () => {
		const { container } = render(MentionInput, { props: { value: 'buy @sa', people: PEOPLE } });
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		expect(container.textContent).toContain('@sam');
	});

	it('keeps the dropdown to roster matches when no group row is given', async () => {
		const { container } = render(MentionInput, { props: { value: 'buy @fa', people: PEOPLE } });
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();
		expect(container.querySelector('[role="listbox"]')).toBeNull();
	});

	it('gives the dropdown rows a test id', async () => {
		const { container } = render(MentionInput, {
			props: { value: 'buy @', people: PEOPLE, everyone: FAMILY }
		});
		const input = inputElement(container);
		await fireEvent.focus(input);
		await flush();

		const options = screen.getAllByTestId('mention-option');
		expect(options).toHaveLength(container.querySelectorAll('[role="option"]').length);
		expect(options[0]).toHaveAttribute('role', 'option');
	});
});
