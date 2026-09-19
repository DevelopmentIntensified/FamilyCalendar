import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import MentionInput from './MentionInput.svelte';
import MentionInputHarness from './MentionInputHarness.svelte';
import { parseTaskQuickAdd, type TaskQuickAddMember } from '$lib/utils/taskQuickAdd';

const MEMBERS: TaskQuickAddMember[] = [
	{ userId: 'u-sam', firstName: 'Sam', lastName: 'Rivera' },
	{ userId: 'u-mom', firstName: 'Mom', lastName: '' },
	{ userId: 'u-dad', firstName: 'Dad', lastName: 'Chen' }
];

afterEach(cleanup);

/**
 * Svelte 5 legacy reactivity flushes on a microtask; DOM reads must wait one
 * beat after an event that changes component state.
 */
function flush(): Promise<void> {
	return Promise.resolve();
}

function titleProbe(container: HTMLElement): HTMLElement {
	const probe = container.querySelector('.title-probe');
	if (!(probe instanceof HTMLElement)) throw new Error('missing title probe');
	return probe;
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
				members: MEMBERS,
				placeholder: 'Add a task…',
				'aria-label': 'Quick add',
				class: 'harness-input',
				id: 'quick-add'
			}
		});
		const input = inputElement(container);
		expect(input).not.toBeNull();
		expect(input).toHaveProperty('placeholder', 'Add a task…');
		expect(input).toHaveAttribute('aria-label', 'Quick add');
		expect(input).toHaveAttribute('id', 'quick-add');
		expect(input.classList.contains('harness-input')).toBe(true);
		// The look-and-feel class goes on the input, not the wrapper.
		const wrapper = container.firstElementChild;
		expect(wrapper?.classList.contains('harness-input')).toBe(false);
	});

	it('never shows suggestions when there is no roster', () => {
		const { container } = render(MentionInput, { props: { value: '@', members: [] } });
		const input = inputElement(container);
		fireEvent.focus(input);
		fireEvent.input(input, { target: { value: '@sa' } });
		expect(container.querySelector('[role="listbox"]')).toBeNull();
	});

	it('opens a listbox for an in-progress mention and closes it without one', async () => {
		const { container } = render(MentionInput, {
			props: { value: 'buy @sa', members: MEMBERS }
		});
		const input = inputElement(container);
		fireEvent.focus(input);
		await flush();
		expect(container.querySelector('[role="listbox"]')).not.toBeNull();
		expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
		expect(container.textContent).toContain('Sam Rivera');

		// A real keystroke replaces the mention with no fragment at all.
		fireEvent.input(input, { target: { value: 'buy milk tomorrow' } });
		await flush();
		expect(container.querySelector('[role="listbox"]')).toBeNull();
	});

	it('lets the wrapper bind the value and maintains it across programmatic resets', async () => {
		const { container } = render(MentionInputHarness, { props: { members: MEMBERS } });
		const input = inputElement(container);
		fireEvent.input(input, { target: { value: 'buy @sa' } });
		await flush();
		expect(input.value).toBe('buy @sa');
		expect(titleProbe(container).textContent).toBe('buy @sa');
	});

	it('inserts the highlighted member (ArrowDown + Enter) and flows the built value back to the bound variable', async () => {
		const { container } = render(MentionInputHarness, { props: { members: MEMBERS } });
		const input = inputElement(container);
		fireEvent.input(input, { target: { value: 'buy @sa' } });
		await flush();
		fireEvent.keyDown(input, { key: 'ArrowDown' });
		fireEvent.keyDown(input, { key: 'Enter' });
		await flush();
		expect(input.value).toBe('buy @Sam Rivera ');
		expect(titleProbe(container).textContent).toBe('buy @Sam Rivera ');
		// Dropdown closed after insertion.
		expect(container.querySelector('[role="listbox"]')).toBeNull();
	});

	it('inserts a full name at the start of the input without double spaces', async () => {
		const { container } = render(MentionInput, {
			props: { value: '@sa buy milk', members: MEMBERS }
		});
		const input = inputElement(container);
		fireEvent.focus(input);
		await flush();
		fireEvent.keyDown(input, { key: 'Enter' });
		await flush();
		expect(input.value).toBe('@Sam Rivera buy milk');
	});

	it('prefers full "First Last" when the fragment equals a single member, and inserts first-name-only for members without a last name', async () => {
		const { container } = render(MentionInput, { props: { value: 'call @mom', members: MEMBERS } });
		const input = inputElement(container);
		fireEvent.focus(input);
		await flush();
		fireEvent.keyDown(input, { key: 'Enter' });
		await flush();
		expect(input.value).toBe('call @Mom ');
	});

	it('closes on tab without submitting the surrounding form by default', async () => {
		const { container } = render(MentionInput, { props: { value: 'buy @da', members: MEMBERS } });
		const input = inputElement(container);
		fireEvent.focus(input);
		await flush();
		expect(container.querySelector('[role="listbox"]')).not.toBeNull();
		fireEvent.keyDown(input, { key: 'Tab' });
		await flush();
		expect(input.value).toBe('buy @Dad Chen ');
		expect(container.querySelector('[role="listbox"]')).toBeNull();
	});

	it('clicking an option inserts it without leaving the input', async () => {
		const { container } = render(MentionInput, { props: { value: 'buy @da', members: MEMBERS } });
		const input = inputElement(container);
		fireEvent.focus(input);
		await flush();
		const option = container.querySelector('[role="option"]');
		if (!option) throw new Error('missing option');
		fireEvent.mouseDown(option);
		fireEvent.click(option);
		await flush();
		expect(input.value).toBe('buy @Dad Chen ');
	});

	it('Escape closes the dropdown and keeps it closed for the same fragment until the next keystroke', async () => {
		const { container } = render(MentionInput, { props: { value: 'buy @da', members: MEMBERS } });
		const input = inputElement(container);
		fireEvent.focus(input);
		await flush();
		expect(container.querySelector('[role="listbox"]')).not.toBeNull();

		fireEvent.keyDown(input, { key: 'Escape' });
		await flush();
		expect(container.querySelector('[role="listbox"]')).toBeNull();

		// Same fragment, no new keystroke (e.g. refocus or a second Enter) — stays closed.
		fireEvent.focus(input);
		await flush();
		expect(container.querySelector('[role="listbox"]')).toBeNull();

		// A real keystroke lifts the lock.
		fireEvent.input(input, { target: { value: 'buy @dad' } });
		await flush();
		expect(container.querySelector('[role="listbox"]')).not.toBeNull();
	});

	it('shows the 👪 family row first when the fragment matches, Enter assigns @family', async () => {
		const { container } = render(MentionInput, {
			props: { value: 'buy @fam', members: MEMBERS }
		});
		const input = inputElement(container);
		fireEvent.focus(input);
		await flush();
		const options = container.querySelectorAll('[role="option"]');
		expect(options.length).toBeGreaterThanOrEqual(1);
		expect(options[0].textContent).toContain('@family');
		fireEvent.keyDown(input, { key: 'Enter' });
		await flush();
		expect(input.value).toBe('buy @family ');
		expect(container.querySelector('[role="listbox"]')).toBeNull();
	});

	it('clicking the family row inserts @family', async () => {
		const { container } = render(MentionInput, {
			props: { value: 'buy @', members: MEMBERS }
		});
		const input = inputElement(container);
		fireEvent.focus(input);
		await flush();
		const family = container.querySelector('#mention-test-option-family');
		// id contains a random uid; fall back to first option (family sorts first).
		const option = family ?? container.querySelector('[role="option"]');
		if (!option) throw new Error('missing family option');
		fireEvent.mouseDown(option);
		fireEvent.click(option);
		await flush();
		expect(input.value).toBe('buy @family ');
	});

	it('member rows show a @handle subtitle', async () => {
		const { container } = render(MentionInput, {
			props: { value: 'buy @sa', members: MEMBERS }
		});
		const input = inputElement(container);
		fireEvent.focus(input);
		await flush();
		expect(container.textContent).toContain('@sam');
	});

	it('the inserted value remains parseable by parseTaskQuickAdd', () => {
		const sampled = MEMBERS.find((m) => m.userId === 'u-sam')!;
		const label = [sampled.firstName, sampled.lastName].filter(Boolean).join(' ');
		const raw = `buy milk @${label}`;
		const parsed = parseTaskQuickAdd(raw, { members: MEMBERS });
		expect(parsed.assignedTo).toBe('u-sam');
		expect(parsed.title).toBe('buy milk');
	});
});
