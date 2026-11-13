<script lang="ts">
	/**
	 * Mention input: a textarea that offers `@` suggestions from a roster and
	 * inserts the picked person as text. Kernel ui; see [../README.md](../README.md).
	 *
	 * Props in, callbacks out: the roster and the optional "everyone" row arrive
	 * as props, the text leaves through `onchange` and a plain Enter through
	 * `onsubmit`. No `fetch`, no `$app/*`, and no group words of its own — the
	 * caller supplies the header, the row title and the inserted token.
	 *
	 * The insertion rules are the legacy ones (`components/MentionInput.svelte`):
	 * the dropdown targets the LAST `@fragment` in the text, Escape and an
	 * insert lock it for that fragment, and a plain Enter picks the highlighted
	 * row or submits. Shift+Enter is always a newline.
	 *
	 * Enter is only ever the picker's when the dropdown is open: with it closed
	 * the key is left alone, so a multi-line caller (the quick-add paste box)
	 * gets its newline and no submit. An IME composition's Enter (isComposing)
	 * belongs to the IME, not to us.
	 */
	import { idColor } from './colorHash';
	import {
		filterMentions,
		type MentionEveryoneOption,
		type MentionPerson
	} from './mentionFilter';

	const DEFAULT_CLASS =
		'w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

	interface Props {
		/** The text. Seeded from the caller and re-seeded when it changes. */
		value?: string;
		/** Who may be mentioned, in roster order. */
		people?: MentionPerson[];
		/** The optional "whole group" row, pinned above the people (e.g. `@family`). */
		everyone?: MentionEveryoneOption | null;
		/** Plain Enter while the dropdown has nothing to pick. */
		onsubmit?: (() => void) | null;
		/** Every edit: typing, and each inserted mention. */
		onchange?: ((value: string) => void) | null;
		placeholder?: string;
		/** Look-and-feel classes for the textarea itself, not the wrapper. */
		class?: string;
		id?: string;
		/** Accessible name; the legacy quick-add callers pass "Quick add". */
		'aria-label'?: string;
		/** `data-testid` for the textarea, so two pickers on one page never collide. */
		testid?: string;
	}

	let {
		value = '',
		people = [],
		everyone = null,
		onsubmit = null,
		onchange = null,
		placeholder = undefined,
		class: klass = DEFAULT_CLASS,
		id = undefined,
		'aria-label': ariaLabel = undefined,
		testid = 'mention-input'
	}: Props = $props();

	/** Per-instance ids so two pickers on a page never collide (legacy used Math.random). */
	const uid = $props.id();
	const listboxId = `mention-${uid}-list`;

	/**
	 * The textarea's text: a WRITABLE derived (Svelte 5.57). Our own insertions
	 * and keystrokes write it locally, so they paint without a round-trip, and a
	 * caller-driven `value` reset recomputes it — the old `untrack` + `$effect`
	 * mirror is gone.
	 */
	let text = $derived(value);

	/** Whether the dropdown is open at all: focus opens it, Escape/insert/blur close it. */
	let open = $state(false);
	/** Index of the keyboard-highlighted row; -1 = none. */
	let highlight = $state(-1);
	/**
	 * Set by Escape/insert so the dropdown does not instantly reappear for the
	 * same fragment. Escape's lock lifts on any real keystroke; the insert lock
	 * additionally remembers the inserted fragment, so the dropdown stays shut
	 * while the user keeps typing around the just-inserted mention.
	 */
	let reopenLocked = $state(false);
	/** Fragment (`Sam` in `@Sam Rivera`) that the last insertion produced. */
	let lastInsertedFragment = $state<string | null>(null);

	/** Auto-grow host; sized whenever the text changes. */
	let area = $state<HTMLTextAreaElement | null>(null);

	/**
	 * A mention candidate is the last `@fragment` token in the text — an `@`
	 * preceded by start-of-string or whitespace, followed by non-space text.
	 * NOT anchored to the end, so a mention whose typing was continued
	 * ("@sa buy milk") stays expandable.
	 */
	function mentionFragmentIn(candidate: string): { at: number; fragment: string } | null {
		const matches = [...candidate.matchAll(/(^|\s)@([^\s@]*)/g)];
		const last = matches[matches.length - 1];
		if (!last || last.index === undefined) return null;
		return { at: last.index + (last[1] ?? '').length, fragment: last[2] ?? '' };
	}

	const currentFragment = $derived(mentionFragmentIn(text)?.fragment ?? null);

	type MentionOption =
		| { kind: 'everyone'; group: MentionEveryoneOption }
		| { kind: 'person'; person: MentionPerson };

	/** Rows the dropdown offers: the caller's group row first, then roster matches. */
	const options: MentionOption[] = $derived.by(() => {
		if (!open || reopenLocked || currentFragment === null || people.length === 0) return [];
		const rows: MentionOption[] = [];
		const group = everyone;
		if (group) {
			const token = group.insert.replace(/^@/, '').toLowerCase();
			const fragment = currentFragment.toLowerCase();
			if (fragment === '' || token.startsWith(fragment)) rows.push({ kind: 'everyone', group });
		}
		for (const person of filterMentions(currentFragment, people))
			rows.push({ kind: 'person', person });
		return rows;
	});

	const show = $derived(options.length > 0);

	/**
	 * The index read as highlighted: the old "auto-highlight the first row" effect,
	 * folded into a derived so nothing writes state from an effect. An explicitly
	 * empty highlight (-1) reads as the first row; an index the list no longer has
	 * stays empty, so Enter falls through to `onsubmit`.
	 */
	const activeIndex = $derived(show && highlight === -1 ? 0 : highlight);
	/** Does the highlight still name a row the list has? */
	const inRange = $derived(show && activeIndex >= 0 && activeIndex < options.length);
	/** The row Enter/Tab would pick; null when there is nothing to pick. */
	const activeOption = $derived(inRange ? (options[activeIndex] ?? null) : null);
	const activeDescendant = $derived(activeOption ? optionId(activeOption) : undefined);

	$effect(() => {
		void text;
		if (!area) return;
		area.style.height = 'auto';
		area.style.height = Math.min(area.scrollHeight, 160) + 'px';
	});

	function labelOf(person: MentionPerson): string {
		return [person.firstName, person.lastName].filter(Boolean).join(' ');
	}

	/** GroupMe-style handle under each name (`@maya`) — the parser matches first names. */
	function handleOf(person: MentionPerson): string {
		return '@' + person.firstName.toLowerCase().replace(/\s+/g, '');
	}

	function optionId(option: MentionOption): string {
		return option.kind === 'everyone'
			? `mention-${uid}-option-everyone`
			: `mention-${uid}-option-${option.person.id}`;
	}

	/** Report an edit: paint it, then hand it to the caller. */
	function setText(next: string) {
		text = next;
		onchange?.(next);
	}

	/**
	 * Replace only the `@fragment` token with the given text plus a trailing
	 * space. Leading whitespace after the token is consumed so mid-string
	 * insertions never leave a double space.
	 */
	function insertToken(insert: string) {
		const fragment = mentionFragmentIn(text);
		if (!fragment) return;
		const rest = text.slice(fragment.at + 1 + fragment.fragment.length).replace(/^\s+/, '');
		const next = text.slice(0, fragment.at) + insert + ' ' + rest;
		setText(next);
		lastInsertedFragment = mentionFragmentIn(next)?.fragment ?? null;
		reopenLocked = true;
		open = false;
		highlight = -1;
	}

	function pick(option: MentionOption | null | undefined) {
		if (!option) return;
		if (option.kind === 'everyone') insertToken(option.group.insert);
		else insertToken('@' + labelOf(option.person));
	}

	function handleFocus() {
		open = true;
	}

	function handleBlur() {
		open = false;
		highlight = -1;
	}

	function handleInput(event: Event & { currentTarget: HTMLTextAreaElement }) {
		// A real keystroke re-arms the dropdown — unless it arrives in the middle
		// of the fragment we just inserted ("@Sam Rivera buy…"), which keeps the
		// inserted mention from instantly re-offering itself.
		const next = event.currentTarget.value;
		const fragment = mentionFragmentIn(next)?.fragment ?? null;
		if (fragment !== lastInsertedFragment) reopenLocked = false;
		setText(next);
		open = true;
		highlight = 0;
	}

	function handleKeydown(event: KeyboardEvent) {
		// An IME is composing the text; Enter and the arrows are its, not ours.
		if (event.isComposing) return;

		if (event.key === 'Escape') {
			if (show) {
				event.preventDefault();
				reopenLocked = true;
				open = false;
				highlight = -1;
			}
			return;
		}

		if (event.key === 'Enter' && !event.shiftKey) {
			// Enter is the picker's only while the list is open: it picks the
			// highlighted row — the group row assigns the whole group — or, with
			// nothing highlighted, submits. Closed, the key is left to the
			// textarea, which types the newline (Shift+Enter is always a newline).
			if (!show) return;
			event.preventDefault();
			if (activeOption) pick(activeOption);
			else onsubmit?.();
			return;
		}

		if (!show) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlight = activeIndex >= options.length - 1 ? 0 : activeIndex + 1;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlight = activeIndex <= 0 ? options.length - 1 : activeIndex - 1;
		} else if (event.key === 'Tab') {
			if (activeOption) {
				event.preventDefault();
				pick(activeOption);
			}
		}
	}
</script>

<div class="relative">
	<textarea
		data-testid={testid}
		class={klass + ' resize-none overflow-y-auto'}
		{id}
		{placeholder}
		rows={2}
		aria-label={ariaLabel}
		bind:this={area}
		value={text}
		autocomplete="off"
		role="combobox"
		aria-expanded={show}
		aria-autocomplete="list"
		aria-controls={listboxId}
		aria-activedescendant={activeDescendant}
		onfocus={handleFocus}
		onblur={handleBlur}
		oninput={handleInput}
		onkeydown={handleKeydown}
	></textarea>

	{#if show}
		<div
			id={listboxId}
			role="listbox"
			aria-label="Mention someone"
			class="absolute left-0 right-0 top-full z-10 mt-1 max-h-[min(16rem,60vh)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
		>
			{#if everyone}
				<p class="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
					{everyone.header}
				</p>
			{/if}
			{#each options as option, i (option.kind === 'everyone' ? 'everyone' : option.person.id)}
				{@const selected = i === activeIndex}
				{#if option.kind === 'everyone'}
					<button
						id={optionId(option)}
						type="button"
						role="option"
						data-testid="mention-option"
						aria-selected={selected}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => pick(option)}
						class="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 {selected
							? 'bg-primary-50'
							: ''}"
					>
						<span
							aria-hidden="true"
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm"
							>{option.group.glyph}</span
						>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-semibold text-slate-800"
								>{option.group.label}</span
							>
							<span class="block truncate text-xs text-slate-400">{option.group.handle}</span>
						</span>
						{#if selected}<span aria-hidden="true" class="text-sm text-primary-600">✓</span>{/if}
					</button>
				{:else}
					<button
						id={optionId(option)}
						type="button"
						role="option"
						data-testid="mention-option"
						aria-selected={selected}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => pick(option)}
						class="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 {selected
							? 'bg-primary-50'
							: ''}"
					>
						<span
							aria-hidden="true"
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold {idColor(
								option.person.id
							)}"
							>{(labelOf(option.person)[0] ?? '?').toUpperCase()}</span
						>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-semibold text-slate-800"
								>{labelOf(option.person)}</span
							>
							<span class="block truncate text-xs text-slate-400"
								>{handleOf(option.person)}</span
							>
						</span>
						{#if selected}<span aria-hidden="true" class="text-sm text-primary-600">✓</span>{/if}
					</button>
				{/if}
			{/each}
			<p class="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400">
				↑↓ to move · Enter to pick
			</p>
		</div>
	{/if}
</div>
