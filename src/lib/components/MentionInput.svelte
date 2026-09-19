<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { avatarColor } from '$lib/utils/avatarColor';
	import type { TaskQuickAddMember } from '$lib/utils/taskQuickAdd';
	import { filterMentions } from '$lib/utils/mentionFilter';

	export let value = '';
	export let members: TaskQuickAddMember[] = [];

	const dispatch = createEventDispatcher<{ submit: void }>();

	/**
	 * A mention candidate is the last `@fragment` token in the value — an `@`
	 * preceded by start-of-string or whitespace, followed by non-space text.
	 * NOT anchored to the end of the string, so a mention whose typing was
	 * continued ("@sa buy milk") stays expandable. `fragment` is the raw text
	 * we filter the roster against.
	 */
	const MENTION_RE = /(^|\s)@([^\s@]*)/g;

	/** Last `@fragment` in `candidate` (position of the `@` + raw text), or null. */
	function mentionFragment(candidate: string): { at: number; fragment: string } | null {
		const matches = [...candidate.matchAll(new RegExp(MENTION_RE.source, 'g'))];
		if (matches.length === 0) return null;
		const m = matches[matches.length - 1];
		if (m.index === undefined) return null;
		return { at: m.index + (m[1]?.length ?? 0), fragment: m[2] };
	}

	/** Roster members matching the current in-progress mention (fresh every call). */
	function matchingMembers(candidate: string): TaskQuickAddMember[] {
		const frag = mentionFragment(candidate);
		return frag && !reopenLocked && members.length > 0
			? filterMentions(frag.fragment, members)
			: [];
	}

	/** Same-tick visibility check (reactive `show` lags until a microtask flush). */
	function visibleNow(): MentionOption[] | null {
		const s = options ?? [];
		return open && !reopenLocked && s.length > 0 ? s : null;
	}

	const DEFAULT_CLASS =
		'w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

	/** Per-instance ids so two pickers on a page never collide. */
	const uid = Math.random().toString(36).slice(2, 8);
	const listboxId = `mention-${uid}-list`;
	function optionId(member: TaskQuickAddMember): string {
		return `mention-${uid}-option-${member.userId}`;
	}

	/** Whether the dropdown is visible. Escape/insert/blur each close it. */
	let open = false;
	/** Index of the keyboard-highlighted suggestion; -1 = none. */
	let highlight = -1;
	/**
	 * Set by Escape/insert so the dropdown does not instantly reappear for the
	 * same fragment. Escape's lock lifts on any real keystroke (on:input); the
	 * insert lock additionally remembers the inserted fragment so the dropdown
	 * stays shut while the user keeps typing around the just-inserted mention
	 * and only re-arms when the fragment actually changes.
	 */
	let reopenLocked = false;
	/** Fragment (`Sam` in `@Sam Rivera`) that the last insertion produced. */
	let lastInsertedFragment: string | null = null;

	$: suggestions = matchingMembers(value);
	$: show = open && !reopenLocked && options.length > 0;
	// Auto-highlight the first row so Enter/Tab always has something to pick.
	$: if (show && highlight === -1) highlight = 0;

	function memberLabel(member: TaskQuickAddMember): string {
		return [member.firstName, member.lastName].filter(Boolean).join(' ');
	}

	function memberInitial(member: TaskQuickAddMember): string {
		const label = memberLabel(member);
		return (label[0] ?? '?').toUpperCase();
	}

	/** GroupMe-style handle under each name (`@maya`) — the parser matches first names. */
	function memberHandle(member: TaskQuickAddMember): string {
		return '@' + member.firstName.toLowerCase().replace(/\s+/g, '');
	}

	type MentionOption = { kind: 'family' } | { kind: 'member'; member: TaskQuickAddMember };
	$: currentFragment = mentionFragment(value)?.fragment ?? null;
	$: showFamily =
		open &&
		members.length > 0 &&
		currentFragment !== null &&
		(currentFragment === '' || 'family'.startsWith(currentFragment.toLowerCase()));
	/** Family row first (GroupMe group-pick), then matching members. */
	$: options = [
			...(showFamily ? [{ kind: 'family' } as MentionOption] : []),
			...suggestions.map((member) => ({ kind: 'member' as const, member }))
	];

	function optionIdFor(o: MentionOption | undefined): string | undefined {
		if (!o) return undefined;
		return o.kind === 'family' ? `mention-${uid}-option-family` : optionId(o.member);
	}

	function handleFocus() {
		open = true;
	}

	function handleBlur() {
		open = false;
		highlight = -1;
	}

	function handleInput() {
		// A real keystroke re-arms the dropdown — unless it arrives in the middle
		// of the fragment we just inserted ("@Sam Rivera buy…"), which keeps the
		// inserted mention from instantly re-offering itself.
		const frag = mentionFragment(value)?.fragment ?? null;
		if (frag !== lastInsertedFragment) reopenLocked = false;
		open = true;
		highlight = 0;
	}

	/** Auto-grow host; resized whenever the value changes. */
	let area: HTMLTextAreaElement | null = null;
	function autosize() {
		if (!area) return;
		area.style.height = 'auto';
		area.style.height = Math.min(area.scrollHeight, 160) + 'px';
	}
	$: if (area) {
		void value;
		autosize();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (visibleNow()) {
				e.preventDefault();
				reopenLocked = true;
				open = false;
				highlight = -1;
			}
			return;
		}
		const shownEnter = e.key === 'Enter' && !e.shiftKey ? visibleNow() : null;
		if (shownEnter !== null) {
			// Plain Enter picks the highlighted row — the 👪 row assigns the
			// whole family — or submits the owning form (Shift+Enter = newline).
			e.preventDefault();
			const target =
				highlight >= 0 && highlight < shownEnter.length ? shownEnter[highlight] : null;
			if (target) {
				if (target.kind === 'family') insertToken('@family');
				else insertMember(target.member);
			} else {
				dispatch('submit');
			}
			return;
		}
		const shown = visibleNow();
		if (!shown) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlight = highlight >= shown.length - 1 ? 0 : highlight + 1;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlight = highlight <= 0 ? shown.length - 1 : highlight - 1;
		} else if (e.key === 'Tab') {
			const target = highlight >= 0 && highlight < shown.length ? shown[highlight] : null;
			if (target) {
				e.preventDefault();
				if (target.kind === 'family') insertToken('@family');
				else insertMember(target.member);
			}
		}
	}

	/**
	 * Replace only the `@fragment` token with the given text plus a trailing
	 * space. Leading whitespace after the token is consumed so mid-string
	 * insertions never leave a double space.
	 */
	function insertToken(text: string) {
		const frag = mentionFragment(value);
		if (!frag) return;
		const rest = value.slice(frag.at + 1 + frag.fragment.length).replace(/^\s+/, '');
		value = value.slice(0, frag.at) + text + ' ' + rest;
		lastInsertedFragment = mentionFragment(value)?.fragment ?? null;
		reopenLocked = true;
		open = false;
		highlight = -1;
	}

	/**
	 * Member insertion: full "First Last" when available (findTaskAssignee
	 * matches the whole variant), first-name-only otherwise.
	 */
	function insertMember(member: TaskQuickAddMember) {
		insertToken('@' + memberLabel(member));
	}
</script>

<div class="relative">
	<textarea
		{...$$restProps}
		class={($$restProps.class ?? DEFAULT_CLASS) + ' resize-none overflow-y-auto'}
		rows={2}
		bind:this={area}
		bind:value
		autocomplete="off"
		role="combobox"
		aria-expanded={show}
		aria-autocomplete="list"
		aria-controls={listboxId}
		aria-activedescendant={show && highlight >= 0 ? optionIdFor(options[highlight]) : undefined}
		on:focus={handleFocus}
		on:blur={handleBlur}
		on:input={handleInput}
		on:keydown={handleKeydown}
	/>

	{#if show}
		<div
			id={listboxId}
			role="listbox"
			aria-label="Mention someone"
			class="absolute left-0 right-0 top-full z-10 mt-1 max-h-[min(16rem,60vh)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
		>
			<p class="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
				Family
			</p>
			{#each options as option, i (option.kind === 'family' ? 'family' : option.member.userId)}
				{@const selected = i === highlight}
				{#if option.kind === 'family'}
					<button
						id={optionIdFor(option)}
						type="button"
						role="option"
						aria-selected={selected}
						on:mousedown={(e) => e.preventDefault()}
						on:click={() => insertToken('@family')}
						class="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 {selected ? 'bg-primary-50' : ''}"
					>
						<span aria-hidden="true" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm">👪</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-semibold text-slate-800">Everyone</span>
							<span class="block truncate text-xs text-slate-400">@family · the whole family</span>
						</span>
						{#if selected}<span aria-hidden="true" class="text-sm text-primary-600">✓</span>{/if}
					</button>
				{:else}
					<button
						id={optionIdFor(option)}
						type="button"
						role="option"
						aria-selected={selected}
						on:mousedown={(e) => e.preventDefault()}
						on:click={() => insertMember(option.member)}
						class="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 {selected ? 'bg-primary-50' : ''}"
					>
						<span aria-hidden="true" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold {avatarColor(option.member.userId)}">
							{memberInitial(option.member)}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-semibold text-slate-800">{memberLabel(option.member)}</span>
							<span class="block truncate text-xs text-slate-400">{memberHandle(option.member)}</span>
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
