/**
 * parsing claim book — one grammar family owns each span (issue 112).
 *
 * Each rule registers the character span it consumed; a later rule reads the
 * MASKED view, where claimed ranges are blanks, so it cannot re-read claimed
 * words. A claim that overlaps one already recorded is dropped: the first
 * family to consume a span keeps it.
 *
 * A pure value on purpose — offsets are plain numbers, `mask` preserves the
 * string length (and its newlines), and nothing here reads a clock.
 */

/** A claimed half-open character range `[start, end)`. */
export interface ClaimSpan {
	start: number;
	end: number;
}

/** The claim book a parse run threads through its grammar families. */
export interface ClaimBook {
	/**
	 * Claim `span`, which began at `index` in the parse input. Returns whether
	 * the claim was recorded — false when it had no position or overlapped an
	 * existing claim (the overlapping claim is dropped, never merged).
	 */
	claim(span: string, index: number | undefined): boolean;
	/** Blank the claimed ranges of `text` at their original offsets; newlines stay. */
	mask(text: string): string;
	/** The claims recorded so far, in the order they were made. */
	readonly spans: readonly ClaimSpan[];
}

/** A fresh, empty claim book. */
export function createClaimBook(): ClaimBook {
	const spans: ClaimSpan[] = [];
	return {
		claim(span, index) {
			if (index === undefined || !span) return false;
			const start = index;
			const end = index + span.length;
			if (spans.some((c) => start < c.end && end > c.start)) return false;
			spans.push({ start, end });
			return true;
		},
		mask(text) {
			if (spans.length === 0) return text;
			const out = text.split('');
			for (const c of spans) {
				for (let i = Math.max(0, c.start); i < Math.min(c.end, out.length); i++) {
					if (out[i] !== '\n') out[i] = ' ';
				}
			}
			return out.join('');
		},
		get spans() {
			return spans;
		}
	};
}
