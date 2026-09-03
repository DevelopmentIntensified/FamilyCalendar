import { toDateTime } from './eventTimes';

/**
 * Master event ids are lucia `generateId(15)` strings or crypto uuids —
 * anything alphanumeric of sane length. This is the canonical validation
 * shared by every place that pulls a composite display id apart.
 */
const MASTER_ID_RE = /^[A-Za-z0-9_-]{5,64}$/;

/**
 * Normalize any timestamp shape into the exact UTC ISO form that
 * `expandRecurrence` / `.toISOString()` produce — the format Exception
 * Override keys and occurrence composite ids are built on. Parsing and
 * construction must never drift from this single rendering, or override
 * matching silently breaks.
 */
export function normalizeOccurrenceIso(value: unknown): string | null {
	return toDateTime(value)?.toUTC().toISO() ?? null;
}

/**
 * Composite occurrence ids look like `{masterId}~{occurrenceISO}`. This
 * builder is the single construction point so parsing and building always
 * share one format.
 */
export function buildOccurrenceId(masterId: string, occurrenceIso: string): string {
	return `${masterId}~${occurrenceIso}`;
}

/**
 * Returns the bare master id from a possibly-composite id, or null when
 * the master part is not a valid event id.
 */
export function resolveMasterId(rawId: unknown): string | null {
	const master = String(rawId ?? '')
		.split('~')[0]
		.trim();
	return MASTER_ID_RE.test(master) ? master : null;
}

export interface ResolvedOccurrenceId {
	masterId: string;
	occurrenceIso?: string;
}

/**
 * Bidirectional half of {@link buildOccurrenceId}: splits a (possibly
 * composite) occurrence id into its master id and, when present, the
 * occurrence ISO normalized to the shared UTC rendering. Returns null when
 * the master id is malformed or the occurrence part is not a parseable ISO
 * timestamp. A non-recurring id (no `~`) resolves with no occurrence.
 */
export function resolveOccurrenceId(rawId: unknown): ResolvedOccurrenceId | null {
	const str = String(rawId ?? '').trim();
	const sep = str.indexOf('~');
	if (sep === -1) {
		return MASTER_ID_RE.test(str) ? { masterId: str } : null;
	}
	const masterRaw = str.slice(0, sep).trim();
	if (!MASTER_ID_RE.test(masterRaw)) return null;
	const occurrenceIso = normalizeOccurrenceIso(str.slice(sep + 1));
	if (!occurrenceIso) return null;
	return { masterId: masterRaw, occurrenceIso };
}
