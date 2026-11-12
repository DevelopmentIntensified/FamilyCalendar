/**
 * `splitStatements` is pure, so it is pinned here without a database. Migration
 * replay depends on it: a blank line separates statements, lines inside a
 * statement stay whole, and only blank chunks are dropped (a comments-only
 * chunk is a statement to Postgres).
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { describe, expect, it } from 'vitest';
import { splitStatements } from './migrationRunner.server';

describe('splitStatements', () => {
	it.each([
		{
			label: 'splits statements separated by a blank line',
			sqlText: 'SELECT 1;\n\nSELECT 2;',
			expected: ['SELECT 1;', 'SELECT 2;']
		},
		{
			label: 'keeps a multi-line statement whole when no blank line separates its lines',
			sqlText: 'CREATE TABLE t (\n\ta int,\n\tb int\n);',
			expected: ['CREATE TABLE t (\n\ta int,\n\tb int\n);']
		},
		{
			label: 'drops trailing blank lines instead of yielding an empty statement',
			sqlText: 'SELECT 1;\n\n\n\nSELECT 2;\n\n',
			expected: ['SELECT 1;', 'SELECT 2;']
		},
		{
			label: 'trims leading blank lines and surrounding whitespace',
			sqlText: '\n\n  SELECT 1;\n\n',
			expected: ['SELECT 1;']
		},
		{
			label: 'keeps a comments-only chunk — only blank chunks are dropped',
			sqlText: '-- just a comment\n\nSELECT 1;',
			expected: ['-- just a comment', 'SELECT 1;']
		}
	])('$label', ({ sqlText, expected }) => {
		expect(splitStatements(sqlText)).toEqual(expected);
	});
});
