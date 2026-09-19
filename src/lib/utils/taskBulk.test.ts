import { describe, expect, it } from 'vitest';
import { splitTaskRecords } from './taskBulk';

describe('splitTaskRecords', () => {
	it('keeps plain one-per-line lists untouched', () => {
		expect(splitTaskRecords('Buy milk tomorrow\nCall mom Friday')).toEqual([
			{ text: 'Buy milk tomorrow', tag: '' },
			{ text: 'Call mom Friday', tag: '' }
		]);
	});

	it('strips bullets and numbered markers', () => {
		expect(splitTaskRecords('• Buy milk\n2) Call mom')).toEqual([
			{ text: 'Buy milk', tag: '' },
			{ text: 'Call mom', tag: '' }
		]);
	});

	it('joins Canvas records and drops score noise', () => {
		const raw = [
			'Overdue Assignments',
			'Discussion Topic',
			'Discussion Thread: Biblical Inerrancy',
			'Due Sep 10 at 11:59pm',
			'-/50 ptsNo submission for this assignment. 50 points possible.',
			'Assignment',
			'Research Paper: Outline Assignment',
			'Due Sep 13 at 11:59pm',
			'68/75 pts scored'
		].join('\n');
		const year = new Date().getFullYear();
		expect(splitTaskRecords(raw)).toEqual([
			{
				text: `Discussion Thread: Biblical Inerrancy Due Sep 10 ${year} at 11:59pm`,
				tag: 'Discussion Topic'
			},
			{
				text: `Research Paper: Outline Assignment Due Sep 13 ${year} at 11:59pm`,
				tag: 'Assignment'
			}
		]);
	});

	it('tags past-section records', () => {
		const raw = ['Past Assignments', 'Quiz', 'Checklist', 'Due Aug 26 at 11:59pm', '10/10 pts'].join(
			'\n'
		);
		const recs = splitTaskRecords(raw);
		expect(recs).toHaveLength(1);
		expect(recs[0].tag).toBe('past · Quiz');
	});
});
