import { describe, expect, it } from 'vitest';
import {
	clampedInt,
	emailAddress,
	firstIssueMessage,
	formList,
	isoDate,
	isoInstant,
	oneOf,
	optionalText,
	requiredText,
	wholeNumber,
	yearMonth,
	z
} from './validators';

function messageOf(
	schema: z.ZodType,
	value: string | number | null | undefined | object
): string | null {
	const result = schema.safeParse(value);
	return result.success ? null : firstIssueMessage(result.error);
}

describe('requiredText', () => {
	const title = requiredText('Title is required');

	it('trims and keeps real text', () => {
		expect(title.parse('  Dishes ')).toBe('Dishes');
	});

	it.each([undefined, null, '', '   ', 42])(
		'rejects %s with the one caller-chosen message',
		(value) => {
			expect(messageOf(title, value)).toBe('Title is required');
		}
	);
});

describe('optionalText', () => {
	it.each([
		['', null],
		['   ', null],
		[null, null],
		[undefined, null],
		[' note ', 'note']
	])('maps %j to %j', (value, expected) => {
		expect(optionalText().parse(value)).toBe(expected);
	});
});

describe('date shapes', () => {
	it('accepts real calendar dates only', () => {
		expect(isoDate().safeParse('2026-02-28').success).toBe(true);
		expect(messageOf(isoDate(), '2026-02-30')).toBe('Invalid date');
		expect(messageOf(isoDate(), '2026-2-3')).toBe('Invalid date');
	});

	it('accepts YYYY-MM months only', () => {
		expect(yearMonth().safeParse('2026-11').success).toBe(true);
		expect(messageOf(yearMonth(), '2026-13')).toBe('Invalid month');
	});

	it('accepts ISO date-times the legacy luxon rule accepted', () => {
		expect(isoInstant().safeParse('2026-11-11T09:30:00Z').success).toBe(true);
		expect(isoInstant().safeParse('2026-11-11').success).toBe(true);
		expect(messageOf(isoInstant('Invalid dueDate'), 'tomorrow')).toBe('Invalid dueDate');
	});
});

describe('emailAddress', () => {
	it.each(['a@b.co', 'first.last+tag@family.example'])('accepts %s', (value) => {
		expect(emailAddress().safeParse(value).success).toBe(true);
	});

	it.each(['plainaddress', 'a@b', '@b.co'])('rejects %s', (value) => {
		expect(messageOf(emailAddress(), value)).toBe('Enter a valid email address');
	});
});

describe('closed vocabularies and numbers', () => {
	it('oneOf rejects values outside the list with the given message', () => {
		const visibility = oneOf(['private', 'public', 'family'], 'Invalid visibility');
		expect(visibility.parse('family')).toBe('family');
		expect(messageOf(visibility, 'secret')).toBe('Invalid visibility');
	});

	it('wholeNumber rejects fractions and negatives', () => {
		const minutes = wholeNumber('Invalid focusMinutes');
		expect(minutes.parse(0)).toBe(0);
		expect(messageOf(minutes, 1.5)).toBe('Invalid focusMinutes');
		expect(messageOf(minutes, -1)).toBe('Invalid focusMinutes');
	});

	it('clampedInt clamps and falls back like the legacy clampCount', () => {
		const maxUses = clampedInt(1, 50, 10);
		expect(maxUses.parse('500')).toBe(50);
		expect(maxUses.parse(0)).toBe(1);
		expect(maxUses.parse('abc')).toBe(10);
		expect(maxUses.parse(undefined)).toBe(10);
	});
});

describe('formList', () => {
	it('turns one form value or many into an array', () => {
		const ids = formList(z.string());
		expect(ids.parse('a')).toEqual(['a']);
		expect(ids.parse(['a', 'b'])).toEqual(['a', 'b']);
		expect(ids.parse(undefined)).toEqual([]);
	});
});
