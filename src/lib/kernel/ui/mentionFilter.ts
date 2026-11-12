/**
 * Mention suggestion rules. Kernel ui; see [../README.md](../README.md).
 *
 * The pure half of `MentionInput`: which roster rows to offer for the
 * `@fragment` being typed. Prefix-based, case-insensitive, roster-scoped.
 * This only decides what to SURFACE; deciding what a sent message means is
 * the caller's parser, not this file's job.
 */

/** A person the mention dropdown may offer. Callers map their own roster onto this. */
export interface MentionPerson {
	id: string;
	firstName: string;
	lastName: string;
}

/**
 * The optional "whole group" row pinned above the people (`@family` and
 * friends). Every word is the caller's: kernel owns no group words.
 */
export interface MentionEveryoneOption {
	/** Section header above the rows, e.g. `Family`. */
	header: string;
	/** The token inserted in place of the fragment, e.g. `@family`. */
	insert: string;
	/** Row title, e.g. `Everyone`. */
	label: string;
	/** Row subtitle, e.g. `@family · the whole family`. */
	handle: string;
	/** Leading glyph, e.g. `👪`. */
	glyph: string;
}

/** Max suggestion rows the mention dropdown shows. */
export const MENTION_SUGGESTION_LIMIT = 8;

/**
 * Case-insensitive prefix filter over a roster for the mention dropdown.
 * Matches firstName, lastName, or the combined "first last". An empty/blank
 * fragment returns the full roster (bounded).
 */
export function filterMentions(fragment: string, people: MentionPerson[]): MentionPerson[] {
	const q = fragment.trim().toLowerCase();
	if (!q) return people.slice(0, MENTION_SUGGESTION_LIMIT);
	return people
		.filter((person) => {
			const first = person.firstName.toLowerCase();
			const last = person.lastName.toLowerCase();
			const full = [first, last].filter(Boolean).join(' ');
			return first.startsWith(q) || last.startsWith(q) || full.startsWith(q);
		})
		.slice(0, MENTION_SUGGESTION_LIMIT);
}
