/**
 * Bulk task input: split a pasted list into one record per task.
 * Plain lists stay one-per-line; Canvas/LMS dumps (type, title, "Due …",
 * score lines) join into single records with the term year pinned so
 * overdue dates never roll to next year.
 */
export interface TaskRecord {
	text: string;
	/** Canvas item type / section ("" for plain lists). */
	tag: string;
}

const BULLET_RE = /^[\s•\-\*›]+/;
const NUMBERED_RE = /^\d+[.)\]]\s*/;
const CANVAS_TYPE = /^(assignment|quiz|discussion topic)$/i;
const CANVAS_SECTION = /^(overdue|upcoming|past)\s+assignments$/i;
const CANVAS_DUE = /^due\s+/i;
const CANVAS_SCORE = /(?:\d+\s*\/\s*)?\d+\s*pts/i;
const CANVAS_DUE_YEAR = /(due\s+[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?)(?!\s*\d{4})/i;

function cleanLine(s: string): string {
	return s.replace(BULLET_RE, '').replace(NUMBERED_RE, '').trim();
}

export function splitTaskRecords(raw: string): TaskRecord[] {
	const lines = raw.split(/\r?\n+/).map(cleanLine).filter(Boolean);
	if (!lines.some((l) => CANVAS_DUE.test(l))) {
		return lines.map((text) => ({ text, tag: '' }));
	}
	const year = new Date().getFullYear();
	const out: TaskRecord[] = [];
	let title: string[] = [];
	let type = '';
	let section = '';
	const flush = (dueText: string) => {
		if (!title.length && !dueText) return;
		// Pin the academic-term year: "Due Sep 10" means this year's Sep 10.
		dueText = dueText.replace(CANVAS_DUE_YEAR, `$1 ${year}`);
		out.push({
			text: [...title, dueText].filter(Boolean).join(' '),
			tag: [section === 'past' ? 'past' : '', type].filter(Boolean).join(' · ')
		});
		title = [];
		type = '';
	};
	for (const line of lines) {
		if (CANVAS_SECTION.test(line)) {
			section = line.split(/\s/)[0].toLowerCase();
			continue;
		}
		if (CANVAS_TYPE.test(line)) {
			type = line;
			continue;
		}
		if (CANVAS_SCORE.test(line)) continue;
		if (CANVAS_DUE.test(line)) {
			flush(line);
			continue;
		}
		title.push(line);
	}
	if (title.length) out.push({ text: title.join(' '), tag: type });
	return out;
}
