<script lang="ts">
	import { avatarColor } from '$lib/utils/avatarColor';
	import type { TaskQuickAddMember } from '$lib/utils/taskQuickAdd';
	import { filterMentions } from '$lib/utils/mentionFilter';

	export let value = '';
	export let members: TaskQuickAddMember[] = [];

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
	function visibleNow(): TaskQuickAddMember[] | null {
		const s = matchingMembers(value);
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
	$: show = open && !reopenLocked && suggestions.length > 0;
	// Auto-highlight the first row so Enter/Tab always has something to pick.
	$: if (show && highlight === -1) highlight = 0;

	function memberLabel(member: TaskQuickAddMember): string {
		return [member.firstName, member.lastName].filter(Boolean).join(' ');
	}

	function memberInitial(member: TaskQuickAddMember): string {
		const label = memberLabel(member);
		return (label[0] ?? '?').toUpperCase();
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
		const shown = visibleNow();
		if (!shown) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlight = highlight >= shown.length - 1 ? 0 : highlight + 1;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlight = highlight <= 0 ? shown.length - 1 : highlight - 1;
		} else if (e.key === 'Enter' || e.key === 'Tab') {
			if (highlight >= 0 && highlight < shown.length) {
				e.preventDefault();
				insertMember(shown[highlight]);
			}
		}
	}

	/**
	 * Replace only the `@fragment` token with `@{First Last} ` (or `@{First} `
	 * when there is no last name). Because findTaskAssignee matches the whole
	 * "First Last" variant, we always insert the full name when available.
	 * Leading whitespace after the token is consumed so mid-string insertions
	 * never leave a double space.
	 */
	function insertMember(member: TaskQuickAddMember) {
		const frag = mentionFragment(value);
		if (!frag) return;
		const label = memberLabel(member);
		const rest = value.slice(frag.at + 1 + frag.fragment.length).replace(/^\s+/, '');
		value = value.slice(0, frag.at) + '@' + label + ' ' + rest;
		lastInsertedFragment = mentionFragment(value)?.fragment ?? null;
		reopenLocked = true;
		open = false;
		highlight = -1;
	}
</script>

<div class="relative">
	<input
		{...$$restProps}
		class={$$restProps.class ?? DEFAULT_CLASS}
		type="text"
		bind:value
		autocomplete="off"
		role="combobox"
		aria-expanded={show}
		aria-autocomplete="list"
		aria-controls={listboxId}
		aria-activedescendant={show && highlight >= 0 ? optionId(suggestions[highlight]) : undefined}
		on:focus={handleFocus}
		on:blur={handleBlur}
		on:input={handleInput}
		on:keydown={handleKeydown}
	/>

	{#if show}
		<div
			id={listboxId}
			role="listbox"
			class="absolute left-0 right-0 top-full z-10 mt-1 max-h-[min(16rem,60vh)] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
		>
			{#each suggestions as member, i (member.userId)}
				<button
					id={optionId(member)}
					type="button"
					role="option"
					aria-selected={i === highlight}
					on:mousedown={(e) => e.preventDefault()}
					on:click={() => insertMember(member)}
					class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 {i ===
					highlight
						? 'bg-slate-100'
						: ''}"
				>
					<span
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold {avatarColor(
							member.userId
						)}"
					>
						{memberInitial(member)}
					</span>
					<span class="truncate">{memberLabel(member)}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
