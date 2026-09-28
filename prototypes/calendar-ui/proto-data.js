/* Shared mock data + render helpers for the calendar prototypes.
   Same shape as the app's Event type (src/lib/types) so chips/tool behaviour
   can be lifted straight across. */

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export { MONTHS, MONTHS_SHORT, DOW };

/* Brand-tinted "calendars" — the palette the app currently lacks a system for.
   Replaces arbitrary user colours with the marketing pastel family. */
export const CALENDARS = [
	{ id: 'fam',   name: 'Family',      tone: 'blush',  ink: 'var(--terracotta)', sw: '#e87539' },
	{ id: 'school', name: 'School',      tone: 'blue',   ink: 'var(--blue-ink)',    sw: '#5b9fb5' },
	{ id: 'work',  name: 'Work',        tone: 'lav',    ink: 'var(--lavender-ink)',sw: '#8d7aa8' },
	{ id: 'kids',  name: 'Kids',        tone: 'mint',   ink: 'var(--mint-ink)',    sw: '#4d9c85' },
	{ id: 'chores',name: 'Chores',      tone: 'peach',  ink: 'var(--peach-ink)',   sw: '#d38248' }
];

export const MEMBERS = [
	{ id: 'me',    name: 'You',        ini: 'J',  tone: 'bg-[#FED5CF] text-[#c45e38]' },
	{ id: 'sam',   name: 'Sarah',      ini: 'S',  tone: 'bg-[#BEDAE3] text-[#366d7e]' },
	{ id: 'kid1',  name: 'Mia',        ini: 'M',  tone: 'bg-[#C4E9DA] text-[#2d5866]' },
	{ id: 'kid2',  name: 'Eli',        ini: 'E',  tone: 'bg-[#F1B598] text-[#84412e]' }
];

/* date keys are YYYY-MM-DD relative to month grid built at runtime */
let SEQ = 0;
const E = (day, start, durMin, title, cal, extra = {}) => ({
	id: 'e' + ++SEQ, day, start, durMin, title, cal, allDay: false, ...extra
});

export function buildEvents(anchorYear, anchorMonth) {
	SEQ = 0;
	return [
		// ── dense week (week view hero content)
		E(1,  '07:30', 60,  'Morning prayer', 'fam', { rsvp: 'going' }),
		E(1,  '08:45', 45,  "Drop Mia at swim", 'school'),
		E(1,  '12:15', 45,  'Team standup', 'work', { rsvp: 'going' }),
		E(1,  '17:30', 60,  'Piano — Eli', 'kids', { attendance: { going: 2, invited: 3 } }),
		E(2,  '09:00', 90,  'Dentist — Mia', 'school', { where: 'Bright Smiles, 4th St' }),
		E(2,  '13:00', 60,  'Lunch w/ Sarah', 'fam', { where: 'Café Lumen' }),
		E(2,  '19:00', 90,  'Family devotions', 'fam', { rsvp: 'going' }),
		E(3,  '07:00', 30,  'Run', 'work'),
		E(3,  '08:30', 75,  'Mia — soccer practice', 'kids'),
		E(3,  '11:00', 60,  '1:1 with Dana', 'work'),
		E(3,  '18:00', 45,  'Chores w/ kids', 'chores'),
		E(4,  '08:00', 60,  'Bible study', 'fam', { rsvp: 'maybe' }),
		E(4,  '10:30', 90,  'Quarterly planning', 'work'),
		E(4,  '16:45', 75,  "Eli — t-ball", 'kids'),
		E(4,  '19:30', 60,  'Date night 💛', 'fam'),
		E(5,  '07:45', 45,  'Drop Eli at school', 'school'),
		E(5,  '12:00', 60,  'Lunch w/ Marcus', 'work', { rsvp: 'declined' }),
		E(5,  '15:00', 120, 'Grocery run', 'chores', { isAd: true, ad: 'Fresh produce, 20% off' }),
		E(5,  '18:30', 120, 'Fri night dinner', 'fam', { attendance: { going: 4, invited: 4 } }),
		E(6,  '09:30', 60,  'Farmers market', 'fam'),
		E(6,  '14:00', 90,  'Mia — birthday party', 'kids', { where: 'Jump City' }),
		E(7,  '10:00', 60,  'Church', 'fam', { rsvp: 'going' }),
		E(7,  '12:00', 60,  'Meal prep', 'chores'),
		E(8,  '08:00', 45,  'School drop-off', 'school'),
		E(8,  '17:00', 60,  'Eli — piano', 'kids'),
		E(9,  '12:30', 60,  'Lunch w/ Mom', 'fam'),
		E(10, '07:30', 60,  'Morning prayer', 'fam'),
		E(10, '09:00', 120, 'Physio — Eli', 'school', { where: 'Northside Clinic' }),
		E(10, '19:00', 60,  'Family game night', 'fam', { attendance: { going: 3, invited: 4 } }),
		E(11, '08:30', 75,  'Mia — soccer practice', 'kids'),
		E(11, '13:00', 60,  'Design review', 'work'),
		E(12, '11:00', 90,  'Roadmap workshop', 'work'),
		E(12, '18:00', 45,  'Chores w/ kids', 'chores'),
		E(13, '10:00', 60,  'Church', 'fam', { rsvp: 'going' }),
		E(13, '15:30', 90,  "Mia — art class", 'kids'),
		E(14, '08:00', 45,  'Drop Mia at school', 'school'),
		E(14, '12:00', 60,  'Retrospective', 'work'),
		E(14, '17:45', 60,  'Taco night', 'fam'),
		E(15, '09:00', 90,  'Dentist — follow-up', 'school'),
		E(15, '18:30', 120, 'Date night 💛', 'fam'),
		E(16, '07:45', 45,  'Drop Eli at school', 'school'),
		E(16, '12:15', 45,  'Team standup', 'work'),
		E(17, '08:30', 75,  'Mia — soccer practice', 'kids'),
		E(17, '19:00', 60,  'Family devotions', 'fam'),
		E(18, '08:00', 60,  'Bible study', 'fam'),
		E(18, '10:30', 90,  'Vendor call', 'work'),
		E(19, '16:45', 75,  'Eli — t-ball', 'kids'),
		E(20, '10:00', 60,  'Church', 'fam'),
		E(20, '12:00', 60,  'Meal prep', 'chores'),
		E(21, '09:00', 60,  'Kickoff call', 'work'),
		E(21, '18:30', 120, 'Fri night dinner', 'fam'),
		E(22, '14:00', 90,  'Mia — birthday party', 'kids'),
		E(23, '09:30', 60,  'Farmers market', 'fam'),
		E(24, '12:00', 60,  'Lunch w/ Mom', 'fam'),
		E(25, '07:30', 60,  'Morning prayer', 'fam'),
		E(25, '19:00', 60,  'Family game night', 'fam'),
		E(26, '08:30', 75,  'Mia — soccer practice', 'kids'),
		E(27, '12:30', 60,  'Lunch w/ Marcus', 'work'),
		E(28, '10:00', 60,  'Church', 'fam', { rsvp: 'going' }),
		E(28, '15:30', 90,  "Mia — art class", 'kids'),
		E(29, '18:00', 45,  'Chores w/ kids', 'chores'),
		E(30, '17:45', 60,  'Taco night', 'fam'),
		E(31, '09:00', 90,  'Quarterly planning', 'work')
	];
}

export const TASKS = [
	{ id: 't1', day: 2,  title: 'Sign Mia’s permission slip', overdue: true,  due: 'Due yesterday' },
	{ id: 't2', day: 3,  title: 'Book Eli’s t-ball jersey',  overdue: false, due: 'Due 3:00 PM' },
	{ id: 't3', day: 5,  title: 'Order cake for Mia',      overdue: false, due: 'Due Friday' },
	{ id: 't4', day: 8,  title: 'Renew car registration',  overdue: false, due: 'Due next week' },
	{ id: 't5', day: 9,  title: 'Return library books',    overdue: false, due: 'Due next week' },
	{ id: 't6', day: 14, title: 'Photo day forms',         overdue: false, due: 'Due in 2 weeks' },
	{ id: 't7', day: 20, title: 'Choir costume order',     overdue: false, due: 'Due later' },
	{ id: 't8', day: 24, title: 'Plan Memorial Day picnic',overdue: false, due: 'Due later' }
];

/* ------------------------------------------------------------- utilities */
export const pad2 = (n) => String(n).padStart(2, '0');
export const iso = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
export const to12 = (hhmm) => {
	const [h, m] = hhmm.split(':').map(Number);
	const ap = h < 12 ? 'AM' : 'PM';
	const hr = h % 12 === 0 ? 12 : h % 12;
	return m === 0 ? `${hr} ${ap}` : `${hr}:${pad2(m)} ${ap}`;
};
export const durLabel = (mins) => {
	const h = Math.floor(mins / 60), m = mins % 60;
	return m === 0 ? (h === 1 ? '1h' : `${h}h`) : h === 0 ? `${m}m` : `${h}h ${m}m`;
};

/** 6-week grid of {y,m,d,outside} honouring a week-start day. */
export function monthGrid(year, month, firstDow = 1) {
	const cells = [];
	const first = new Date(year, month - 1, 1);
	let lead = (first.getDay() - firstDow + 7) % 7;
	const start = new Date(year, month - 1, 1 - lead);
	for (let i = 0; i < 42; i++) {
		const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
		cells.push({
			y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(),
			grid: i, outside: dt.getMonth() !== month - 1
		});
	}
	return cells;
}

/** Compact grid sized to the real number of weeks the month needs. */
export function monthGridTrimmed(year, month, firstDow = 1) {
	const first = new Date(year, month - 1, 1);
	const lead = (first.getDay() - firstDow + 7) % 7;
	const daysInMonth = new Date(year, month, 0).getDate();
	const total = Math.ceil((lead + daysInMonth) / 7) * 7;
	const start = new Date(year, month - 1, 1 - lead);
	return Array.from({ length: total }, (_, i) => {
		const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
		return {
			y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(),
			grid: i, outside: dt.getMonth() !== month - 1
		};
	});
}

export function dowRow(firstDow = 1) {
	return Array.from({ length: 7 }, (_, i) => DOW[(i + firstDow) % 7]);
}

/** Split a 42-cell grid into rows of 7 (MonthDays does the same). */
export function chunkRows(cells) {
	const rows = [];
	for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
	return rows;
}

export const esc = (s) =>
	String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* -------------------------------------------------------------- chip DOM */
export function chipHTML(ev, opts = {}) {
	const cal = CALENDARS.find((c) => c.id === ev.cal) ?? CALENDARS[0];
	const { compact = false, selected = false, showTime = true, showBox = false, drag = false } = opts;

	const bits = [];
	if (showBox) {
		bits.push(
			`<span class="chip__box${selected ? ' is-on' : ''}">${
				selected
					? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" style="height:.6rem;width:.6rem"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
					: ''
			}</span>`
		);
	}
	if (ev.isAd) {
		bits.push(
			`<svg viewBox="0 0 20 20" fill="currentColor" style="height:.7rem;width:.7rem;flex:none;color:#f59e0b"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/></svg>`
		);
	}
	if (showTime && !ev.allDay && !compact) {
		bits.push(`<span class="chip__time">${to12(ev.start)}</span>`);
	} else if (showTime && !ev.allDay) {
		bits.push(`<span class="chip__dot" style="background:${cal.sw}"></span>`);
	}
	bits.push(`<span class="chip__title">${esc(ev.title)}</span>`);

	if (ev.rsvp === 'going' && !compact) {
		bits.push(
			`<span style="flex:none;display:grid;place-items:center;height:.875rem;width:.875rem;border-radius:9999px;background:rgba(196,233,218,.9);color:#2d5866;font-size:.5rem;font-weight:800">✓</span>`
		);
	}
	if (ev.rsvp === 'declined' && !compact) {
		bits.push(
			`<span style="flex:none;opacity:.45;font-size:.625rem;font-weight:800">✕</span>`
		);
	}
	if (ev.attendance && !compact) {
		const pct = Math.round((ev.attendance.going / ev.attendance.invited) * 100);
		bits.push(
			`<span class="hide-sm" style="flex:none;display:grid;place-items:center;height:.875rem;min-width:.875rem;padding:0 .25rem;border-radius:9999px;background:rgba(190,218,227,.75);color:#366d7e;font-size:.5rem;font-weight:800">${ev.attendance.going}/${ev.attendance.invited}</span>`
		);
		void pct;
	}

	const tone = ev.isAd ? 'chip--ad' : `chip--${cal.tone}`;
	const picked = selected ? ' is-picked' : '';
	const rsvpDim = ev.rsvp === 'declined' ? ' style="opacity:.55"' : '';
	const dragAttr = drag ? ' draggable="true"' : '';

	return `<button type="button" class="chip ${tone}${picked}"${rsvpDim}${dragAttr} data-ev="${ev.id}" data-title="${esc(ev.title)}">${bits.join('')}</button>`;
}

export function taskChipHTML(t, opts = {}) {
	const { selected = false, showBox = false } = opts;
	const cls = `chip--task${t.overdue ? ' is-overdue' : ''}${selected ? ' is-picked' : ''}`;
	const box = showBox
		? `<span class="chip__box${selected ? ' is-on' : ''}">${
				selected
					? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" style="height:.6rem;width:.6rem"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
					: ''
			}</span>`
		: `<span class="chip__check"></span>`;
	return `<button type="button" class="chip ${cls}" data-task="${t.id}" data-title="${esc(t.title)}">${box}<span class="chip__title">${esc(t.title)}</span></button>`;
}

/* ------------------------------------------------------- shared app state */
export function createShellState(anchor = { y: 2026, m: 9, d: 25 }) {
	return {
		year: anchor.y,
		month: anchor.m,
		today: anchor.d,
		view: 'month',
		selectMode: false,
		addMode: false,
		activeDay: anchor.d,
		hidden: new Set(),
		picked: new Set(),
		firstDow: 1
	};
}

export function visibleEvents(state, events) {
	return events.filter((e) => !state.hidden.has(e.cal));
}
export function visibleTasks(state, tasks) {
	return tasks.filter((t) => !state.hidden.has('chores'));
}
