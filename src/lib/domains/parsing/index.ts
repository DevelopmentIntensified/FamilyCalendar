/**
 * parsing — public isomorphic interface: the Task quick-add, the vocabulary
 * and cadence rules and their result types.
 * Other modules import parsing ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 *
 * The EVENT parser is not here on purpose: it pulls in `compromise`
 * (~352 KB minified), so it lives in `index.server.ts` only.
 * Doc: ./README.md#public-interface
 */
export { parseTaskQuickAdd, findTaskAssignee, normalizeQuickAddTags } from './parsing.task.rules';
export type {
	QuickAddPriority,
	TaskAssigneeMatch,
	TaskQuickAddMember,
	TaskQuickAddOptions,
	TaskQuickAddResult
} from './parsing.task.rules';

export {
	DAYPART_TIMES,
	DAY_ALT,
	DAY_MAP,
	MONTH_ABBREV_INDEX,
	MONTH_ALT,
	MONTH_FULL,
	MONTH_FULL_INDEX,
	MONTH_INDEX_0,
	MONTH_INDEX_1,
	MONTH_NAME_TOKEN,
	ORDINAL_WORD_MAP,
	ORDINAL_WORDS_PATTERN,
	RECURRENCE_UNITS,
	TOD_TIMES,
	WEEKDAY_FULL,
	WEEKDAY_SHORT,
	WEEKDAY_TOKEN,
	applyPeriod,
	dayNumber,
	escapeRegExp,
	extractDayTokens,
	fuzzyDayToken,
	normalizeDayToken,
	normalizeMeridiem,
	normalizeTime
} from './parsing.vocabulary.rules';
export type { DayToken } from './parsing.vocabulary.rules';

export {
	CADENCE_FREQUENCIES,
	cadenceFrequency,
	cadenceToValue,
	cadenceUnit,
	matchCadence,
	valueToCadence
} from './parsing.dates.rules';
export type { Cadence, CadenceMatch, CadenceUnit } from './parsing.dates.rules';
