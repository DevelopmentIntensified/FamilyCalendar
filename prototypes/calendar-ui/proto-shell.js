/* Shared interaction wiring for the calendar prototypes.
   Every prototype keeps the FULL feature set the app has today:
   month/week/day/list views, month nav + picker, swipe, add mode, range
   select, select/bulk mode, filters, event/task detail sheet, NLP quick add,
   day overflow, mobile action sheet, toasts, deep links. */

import {
	CALENDARS, MONTHS, MONTHS_SHORT, buildEvents, TASKS,
	monthGridTrimmed, monthGrid, dowRow, chunkRows, chipHTML, taskChipHTML,
	to12, durLabel, esc, visibleEvents, createShellState, iso
} from './proto-data.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const ICON = {
	chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="height:1rem;width:1rem"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>',
	chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="height:1rem;width:1rem"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>',
	chevD: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="height:1rem;width:1rem"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>',
	cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="height:1rem;width:1rem"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>',
	week: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="height:1rem;width:1rem"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h18v18H3zM3 9h18v12H3zM7 12v6M11 12v6M15 12v6"/></svg>',
	day: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="height:1rem;width:1rem"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM9 15h6"/></svg>',
	list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="height:1rem;width:1rem"><path stroke-linecap="round" stroke-linejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
	plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="height:.75rem;width:.75rem"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>',
	plusLg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="height:1.5rem;width:1.5rem"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>',
	grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="height:.75rem;width:.75rem"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>',
	filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="height:1rem;width:1rem"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5h18l-7 8v6l-4 2v-8L3 5z"/></svg>',
	search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="height:1rem;width:1rem"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"/></svg>',
	check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="height:.875rem;width:.875rem"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
	close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="height:.875rem;width:.875rem"><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18"/></svg>',
	spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="height:1rem;width:1rem"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"/></svg>'
};

export function mount(opts) {
	const {
		viewHost,      // element that receives the view markup
		navHost,       // month/year label + prev/next/today
		viewSwitchHost,
		railHost,      // optional sidebar/rail
		legendHost,    // optional filter legend
		start = { y: 2026, m: 9, d: 25 },
		railMode = false
	} = opts;

	const state = createShellState(start);
	const events = buildEvents(state.year, state.month);
	const firstDow = state.firstDow;

	/* ------------------------------------------------------------- render */
	/**
	 * Events for a grid cell. Keyed on (month, day) and hard-scoped to the
	 * rendered month — the leading/trailing padding cells belong to the
	 * previous/next month and must not inherit this month's events.
	 */
	function evsFor(day, cellMonth = state.month, cellYear = state.year) {
		if (cellMonth !== state.month || cellYear !== state.year) return [];
		return visibleEvents(state, events).filter((e) => e.day === day);
	}
	function tskFor(day, cellMonth = state.month, cellYear = state.year) {
		if (cellMonth !== state.month || cellYear !== state.year) return [];
		return TASKS.filter((t) => t.day === day);
	}
	/** For single-day views where only the day number is in play. */
	const evsOn = (day) => evsFor(day);
	const tsksOn = (day) => tskFor(day);

	function renderNav() {
		if (!navHost) return;
		navHost.innerHTML = `
			<button class="btn btn-soft btn-sm" data-act="today">Today</button>
			<button class="btn-icon" data-act="prev" aria-label="Previous month">${ICON.chevL}</button>
			<button class="btn-icon" data-act="next" aria-label="Next month">${ICON.chevR}</button>`;
	}

	function renderMonthHeader() {
		$$('[data-mlabel]').forEach((el) => {
			el.textContent = `${MONTHS[state.month - 1]} ${state.year}`;
		});
		$$('[data-count]').forEach((el) => {
			const n = visibleEvents(state, events).length;
			el.textContent = n === 1 ? '1 event this month' : `${n} events this month`;
		});
	}

	/* ------------------------------------------------------- month view  */
	function monthView() {
		const cells = monthGridTrimmed(state.year, state.month, firstDow);
		const dows = dowRow(firstDow);
		const today = { y: state.year, m: state.month, d: state.today };
		const isToday = (c) => c.y === today.y && c.m === today.m && c.d === today.d;
		const dow = (c) => (c.y + c.m + c.d) % 7;
		const isWknd = (c) => dow(c) === 0 || dow(c) === 6;

		const head = `<div class="cal-dowrow">${dows
			.map(
				(d, i) =>
					`<div class="cal-dow${isWknd({ y: 0, m: 0, d: i }) ? ' is-weekend' : ''}${
						(i + firstDow) % 7 === today.d % 7 && i === 6 ? '' : ''
					}">${d}</div>`
			)
			.join('')}</div>`;

		const body = chunkRows(cells)
			.map(
				(row) => `<div class="cal-grid">${row
					.map((c) => {
						const evs = evsFor(c.d, c.m, c.y);
						const tsks = tskFor(c.d, c.m, c.y);
						const MAX_E = 3, MAX_T = 2;
						const shownE = evs.slice(0, MAX_E);
						const shownT = tsks.slice(0, MAX_T);
						const extra = evs.length - shownE.length + (tsks.length - shownT.length);
						const todayCls = isToday(c) ? ' is-today' : '';
						const outCls = c.outside ? ' is-outside' : '';
						const wkndCls = isWknd(c) && !c.outside ? ' is-weekend' : '';
						const cellSel = c.d === state.activeDay && c.m === state.month ? ' is-selected' : '';
						const selCls = state.selectMode ? ' selecting' : '';

						const chips =
							shownE
								.map((e) =>
									chipHTML(e, {
										compact: true,
										selected: state.picked.has(e.id),
										showTime: false,
										showBox: state.selectMode,
										drag: true
									})
								)
								.join('') +
							shownT
								.map((t) =>
									taskChipHTML(t, { selected: state.picked.has(t.id), showBox: state.selectMode })
								)
								.join('');

						const more = extra > 0
							? `<button class="chip__more" data-overflow="${c.d}" data-m="${c.m}">+${extra} more</button>`
							: '';

						return `<div class="cal-cell${todayCls}${outCls}${wkndCls}${cellSel}${selCls}"
							data-day="${c.d}" data-m="${c.m}" data-y="${c.y}" role="button" tabindex="0">
							<div class="cal-cell__top">
								<span class="cal-num">${c.d}</span>
								<span class="cal-cell__tools">
									<button class="cal-tool" data-add="${c.d}" data-m="${c.m}" data-y="${c.y}" aria-label="Add on ${c.d}" title="Add">${ICON.plus}</button>
									<a class="cal-tool" href="#daydash" aria-label="Day dashboard" title="Day dashboard">${ICON.grid}</a>
								</span>
							</div>
							<div class="stack-1">${chips}${more}</div>
						</div>`;
					})
					.join('')}</div>`
			)
			.join('');

		return `<div class="cal-frame">${head}${body}</div>`;
	}

	/* -------------------------------------------------------- week view  */
	function weekView() {
		const cells = monthGridTrimmed(state.year, state.month, firstDow);
		const todayIdx = cells.findIndex((c) => c.d === state.today && c.m === state.month && c.y === state.year);
		const start = todayIdx >= 0 ? todayIdx - todayIdx % 7 : 0;
		const week = cells.slice(start, start + 7);
		const HOUR_H = 44; // compressed vs 60px in prod
		const NIGHT = [0, 1, 2, 3, 4, 23];

		const rows = Array.from({ length: 24 }, (_, h) => {
			const night = NIGHT.includes(h);
			return `<div class="wk__row" style="height:${HOUR_H}px;${night ? 'background:rgba(248,246,243,.65)' : ''}">
				<div class="wk__h">${h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : h - 12 + 'p'}</div>
				${week.map((c) => `<div class="wk__c"></div>`).join('')}
			</div>`;
		}).join('');

		const colEvents = week
			.map((c) => {
				const evs = evsFor(c.d, c.m, c.y).filter((e) => !e.allDay);
				const lanes = [];
				evs.forEach((e) => {
					const [sh, sm] = e.start.split(':').map(Number);
					const s = sh * 60 + sm, en = s + e.durMin;
					let lane = lanes.findIndex((l) => l.every((x) => x.end <= s || x.start >= en));
					if (lane === -1) { lane = lanes.length; lanes.push([]); }
					lanes[lane].push({ s, en, e });
				});
				const total = Math.max(lanes.length, 1);
				return `<div class="wk__col" data-col="${c.d}">${lanes
					.map((lane, li) =>
						lane
							.map(({ s, en, e }) => {
								const cal = CALENDARS.find((x) => x.id === e.cal) ?? CALENDARS[0];
								const top = (s / 1440) * 100;
								const h = Math.max(((en - s) / 1440) * 100, 2.4);
								const w = 100 / total;
								return `<button class="wk__ev" draggable="true" data-ev="${e.id}"
									style="top:${top}%;height:${h}%;left:${(li * w).toFixed(3)}%;width:calc(${w.toFixed(3)}% - 5px);
									background:${rgba(cal.sw, 0.2)};box-shadow:inset 3px 0 0 ${cal.sw}, 0 1px 2px rgba(0,0,0,.06)">
									<strong>${esc(e.title)}</strong>
									${h > 4 ? `<span>${to12(e.start)}</span>` : ''}
								</button>`;
							})
							.join('')
					)
					.join('')}</div>`;
			})
			.join('');

		const nowTop = ((8 * 60 + 42) / 1440) * 100;

		const allDayRow = week
			.map((c) => {
				const items = evsFor(c.d, c.m, c.y).filter((e) => e.allDay);
				return `<div class="wk__c" style="min-height:1.75rem;padding:.25rem .25rem 0">${items
					.map((e) => {
						const cal = CALENDARS.find((x) => x.id === e.cal) ?? CALENDARS[0];
						return `<div style="border-radius:.375rem;background:${rgba(cal.sw, 0.22)};box-shadow:inset 2px 0 0 ${cal.sw};padding:.125rem .25rem;font-size:.625rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.title)}</div>`;
					})
					.join('')}</div>`;
			})
			.join('');

		return `<div class="wk">
			<div class="wk__head" style="display:grid;grid-template-columns:3.75rem repeat(7,minmax(0,1fr));border-bottom:1px solid var(--s200);background:rgba(255,255,255,.6)">
				<div></div>
				${week
					.map((c) => {
						const isT = c.d === state.today && c.m === state.month;
						return `<div style="text-align:center;padding:.625rem .25rem">
							<div style="font-size:.625rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${isT ? 'var(--terracotta)' : 'var(--s400)'}">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow(c)]}</div>
							<div style="display:inline-grid;place-items:center;height:1.75rem;min-width:1.75rem;border-radius:9999px;margin-top:.125rem;font-size:.875rem;font-weight:700;${isT ? 'background:var(--terracotta);color:#fff;box-shadow:0 6px 12px -4px rgba(196,94,56,.6)' : 'color:var(--s700)'}">${c.d}</div>
						</div>`;
					})
					.join('')}
			</div>
			<div class="wk__row" style="grid-template-columns:3.75rem repeat(7,minmax(0,1fr))">
				<div style="border-right:1px solid var(--s200)"></div>
				${allDayRow}
			</div>
			<div class="wk__scroll" id="wkScroll">
				<div style="position:relative;height:${HOUR_H * 24}px">
					${rows}
					<div class="wk__overlay" style="grid-template-columns:3.75rem repeat(7,minmax(0,1fr))">
						<div></div>
						${colEvents}
					</div>
					<div class="wk__now" style="top:${nowTop}%"></div>
				</div>
			</div>
		</div>`;
	}

	/* --------------------------------------------------------- day view  */
	function dayView() {
		const d = state.activeDay;
		const evs = evsFor(d);
		const tsks = tskFor(d);
		const HOUR_H = 56;
		const rows = Array.from({ length: 24 }, (_, h) => {
			const night = [0, 1, 2, 3, 4, 23].includes(h);
			return `<div style="display:grid;grid-template-columns:3.75rem 1fr;border-bottom:1px solid var(--s100);height:${HOUR_H}px;${night ? 'background:rgba(248,246,243,.65)' : ''}">
				<div style="border-right:1px solid var(--s200);padding:.25rem .5rem 0 0;text-align:right;font-size:.6875rem;font-weight:600;color:var(--s400)">${h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : h - 12 + ' PM'}</div>
				<div class="wk__c wk-day-drop" data-drop-day="${d}"></div>
			</div>`;
		}).join('');

		const lanes = [];
		evs.forEach((e) => {
			const [sh, sm] = e.start.split(':').map(Number);
			const s = sh * 60 + sm, en = s + e.durMin;
			let lane = lanes.findIndex((l) => l.every((x) => x.end <= s || x.start >= en));
			if (lane === -1) { lane = lanes.length; lanes.push([]); }
			lanes[lane].push({ s, en, e });
		});
		const total = Math.max(lanes.length, 1);
		const overlay = lanes
			.map((lane, li) =>
				lane
					.map(({ s, en, e }) => {
						const cal = CALENDARS.find((x) => x.id === e.cal) ?? CALENDARS[0];
						const w = 100 / total;
						return `<button class="wk__ev" draggable="true" data-ev="${e.id}"
							style="top:${(s / 1440) * 100}%;height:${Math.max(((en - s) / 1440) * 100, 2.6)}%;left:${(li * w).toFixed(3)}%;width:calc(${w.toFixed(3)}% - 8px);background:${rgba(cal.sw, 0.2)};box-shadow:inset 3px 0 0 ${cal.sw}, 0 2px 6px rgba(0,0,0,.08)">
							<strong>${esc(e.title)}</strong><span>${to12(e.start)} – ${to12(minsToHHMM(s + e.durMin))}</span>
						</button>`;
					})
					.join('')
			)
			.join('');

		const nowTop = ((8 * 60 + 42) / 1440) * 100;
		const dateLine = `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow({ y: 0, m: 0, d: (d + firstDow - 1) % 7 })]}`;

		return `
		<div class="rowflex between gap-3" style="margin-bottom:.875rem">
			<button class="btn btn-soft btn-sm" data-act="back">${ICON.chevL} <span class="hide-sm">Back</span></button>
			<div class="stack-1" style="text-align:center">
				<div style="font-size:1.125rem;font-weight:800;color:var(--s900)">${dateLine}, ${MONTHS_SHORT[state.month - 1]} ${d}</div>
				<div class="hint">${evs.length} event${evs.length === 1 ? '' : 's'} · ${tsks.length} task${tsks.length === 1 ? '' : 's'} due</div>
			</div>
			<button class="btn btn-primary btn-sm" data-act="new-day">${ICON.plus} New</button>
		</div>
		<div class="wk">
			<div style="padding:.75rem 1rem;background:rgba(255,255,255,.6);border-bottom:1px solid var(--s200);display:flex;gap:.5rem;flex-wrap:wrap">
				${tsks.length ? tsks.map((t) => taskChipHTML(t, { showBox: false })).join('') : ''}
				${tsks.length ? '' : '<span class="hint">No tasks due.</span>'}
			</div>
			<div style="max-height:66vh;overflow-y:auto">
				<div style="position:relative;height:${HOUR_H * 24}px">
					${rows}
					<div class="wk__overlay" style="grid-template-columns:3.75rem 1fr">
						<div></div>
						<div class="wk__col">${overlay}</div>
					</div>
					<div class="wk__now" style="top:${nowTop}%"></div>
				</div>
			</div>
		</div>`;
	}

	/* ------------------------------------------------------- list view  */
	function listView() {
		const cells = monthGridTrimmed(state.year, state.month, firstDow).filter((c) => !c.outside);
		const days = cells
			.map((c) => {
				const evs = evsFor(c.d, c.m, c.y);
				const tsks = tskFor(c.d, c.m, c.y);
				if (!evs.length && !tsks.length) return '';
				const isT = c.d === state.today;
				const rows =
					evs
						.map(
							(e) => `<button class="nextrow" data-ev="${e.id}">
								<span class="nextrow__rail" style="background:${(CALENDARS.find((x) => x.id === e.cal) ?? CALENDARS[0]).sw}"></span>
								<span style="flex:1">
									<span class="nextrow__t" style="display:block">${to12(e.start)} · ${durLabel(e.durMin)}</span>
									<span class="nextrow__n" style="display:block">${esc(e.title)}</span>
									${e.where ? `<span class="nextrow__m" style="display:block">${esc(e.where)}</span>` : ''}
								</span>
							</button>`
						)
						.join('') +
					tsks
						.map(
							(t) => `<button class="nextrow" data-task="${t.id}">
								<span class="nextrow__rail" style="background:var(--s300)"></span>
								<span style="flex:1">
									<span class="nextrow__t" style="display:block">Task · ${esc(t.due)}</span>
									<span class="nextrow__n" style="display:block">${esc(t.title)}</span>
								</span>
							</button>`
						)
						.join('');
				return `<div class="rail__card" style="border-radius:1.25rem;padding:.875rem">
					<div class="rowflex between" style="margin-bottom:.5rem">
						<span class="pill pill-xs ${isT ? 'pill-blush' : 'pill-token'}">${dow(c)} ${c.d} ${MONTHS_SHORT[state.month - 1]}</span>
						<span class="hint">${evs.length + tsks.length} item${evs.length + tsks.length === 1 ? '' : 's'}</span>
					</div>
					${rows}
				</div>`;
			})
			.filter(Boolean)
			.join('');
		return `<div class="stack-3">${days || '<div class="rail__card" style="text-align:center;padding:3rem"><p class="hint">Nothing scheduled this month.</p><button class="btn btn-primary btn-md" style="margin-top:1rem" data-act="new-day">Add something</button></div>'}</div>`;
	}

	/* --------------------------------------------------------- rail/leg  */
	function legend() {
		return CALENDARS.map((c) => {
			const n = visibleEvents(state, events).filter((e) => e.cal === c.id).length;
			const off = state.hidden.has(c.id);
			return `<button class="legend__row${off ? ' is-off' : ''}" data-filter="${c.id}">
				<span class="legend__sw" style="background:${c.sw}"></span>
				<span class="legend__name">${c.name}</span>
				<span class="legend__count">${n}</span>
			</button>`;
		}).join('');
	}

	function upcomingRail(limit = 6) {
		const cells = monthGridTrimmed(state.year, state.month, firstDow);
		const todayCell = cells.find((c) => !c.outside && c.d === state.today);
		const from = todayCell ? cells.indexOf(todayCell) : 0;
		const out = [];
		for (let i = from; i < cells.length && out.length < limit; i++) {
			const c = cells[i];
			evsFor(c.d, c.m, c.y).forEach((e) => out.push({ e, c }));
		}
		return out
			.map(
				({ e, c }) => `<button class="nextrow" data-ev="${e.id}">
					<span class="nextrow__rail" style="background:${(CALENDARS.find((x) => x.id === e.cal) ?? CALENDARS[0]).sw}"></span>
					<span style="flex:1;min-width:0">
						<span class="nextrow__t" style="display:block">${c.d === state.today ? 'Today' : c.d === state.today + 1 ? 'Tomorrow' : `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow(c)]} ${c.d} ${MONTHS_SHORT[c.m - 1]}`} · ${to12(e.start)}</span>
						<span class="nextrow__n truncate" style="display:block">${esc(e.title)}</span>
						${e.where ? `<span class="nextrow__m truncate" style="display:block">${esc(e.where)}</span>` : ''}
					</span>
				</button>`
			)
			.join('');
	}

	/* ------------------------------------------------------------ sheets */
	function openEventSheet(ev) {
		const cal = CALENDARS.find((c) => c.id === ev.cal) ?? CALENDARS[0];
		const [h, m] = ev.start.split(':').map(Number);
		const end = minsToHHMM(h * 60 + m + ev.durMin);
		showSheet(
			`<div class="rowflex gap-3" style="align-items:flex-start">
				<span style="height:2.75rem;width:2.75rem;border-radius:1rem;flex:none;display:grid;place-items:center;background:${rgba(cal.sw, 0.2)};color:${cal.ink}">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="height:1.25rem;width:1.25rem"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/></svg>
				</span>
				<span style="min-width:0">
					<span class="pill pill-xs" style="background:${rgba(cal.sw, 0.2)};color:${cal.ink};margin-bottom:.25rem">${cal.name}${ev.isAd ? ' · Sponsored' : ''}</span>
					<h2 style="margin:0;font-size:1.25rem;font-weight:800;color:var(--s900);line-height:1.2">${esc(ev.title)}</h2>
				</span>
			</div>`,
			`<div class="stack-4">
				<div class="rail__card" style="background:var(--canvas)">
					<div class="rail__title">${ICON.cal} When</div>
					<div style="font-size:.9375rem;font-weight:600;color:var(--s800)">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow({ y: 0, m: 0, d: (ev.day + firstDow - 1) % 7 })]}, ${MONTHS_SHORT[state.month - 1]} ${ev.day}</div>
					<div style="font-size:.875rem;color:var(--s500)">${to12(ev.start)} – ${to12(end)} · ${durLabel(ev.durMin)}</div>
				</div>
				${ev.where ? `<div class="rail__card" style="background:var(--canvas)"><div class="rail__title">Where</div><div style="font-size:.9375rem;color:var(--s800)">${esc(ev.where)}</div></div>` : ''}
				${ev.attendance ? `<div class="rail__card" style="background:var(--canvas)"><div class="rail__title">Going</div>
					<div class="rowflex gap-2" style="flex-wrap:wrap">
						${['J', 'S', 'M', 'E'].slice(0, ev.attendance.going).map((ini) => `<span style="display:grid;place-items:center;height:2rem;width:2rem;border-radius:9999px;background:var(--mint);color:var(--mint-ink);font-size:.75rem;font-weight:800">${ini}</span>`).join('')}
						${Array.from({ length: Math.max(0, ev.attendance.invited - ev.attendance.going) }, () => `<span style="display:grid;place-items:center;height:2rem;width:2rem;border-radius:9999px;background:var(--s100);color:var(--s400);font-size:.75rem;font-weight:800">?</span>`).join('')}
					</div>
					<div class="rowflex gap-2" style="margin-top:.75rem">
						<button class="btn btn-token btn-sm">${ICON.check} Going</button>
						<button class="btn btn-soft btn-sm">Maybe</button>
						<button class="btn btn-soft btn-sm">Can't go</button>
					</div>
				</div>` : ''}
				${ev.isAd ? `<div class="rail__card" style="background:#fffbeb;border-color:#fde68a"><div class="rail__title" style="color:#b45309">Sponsored</div><div style="font-size:.875rem;color:#92400e">${esc(ev.ad || '')}</div></div>` : ''}
			</div>`,
			`<button class="btn btn-soft btn-md" data-sheet="close">Close</button>
			 <button class="btn btn-soft btn-md" data-sheet="dup">${ICON.spark} Duplicate</button>
			 <span style="flex:1"></span>
			 <button class="btn btn-ghost btn-md" data-sheet="del" style="color:#dc2626;box-shadow:inset 0 0 0 2px #fecaca">Delete</button>
			 <button class="btn btn-primary btn-md" data-sheet="edit">Edit</button>`
		);
	}

	function openTaskSheet(t) {
		showSheet(
			`<div class="rowflex gap-3" style="align-items:center">
				<span class="chip__check" style="height:2.5rem;width:2.5rem;border-width:3px"></span>
				<h2 style="margin:0;font-size:1.25rem;font-weight:800;color:var(--s900);line-height:1.2">${esc(t.title)}</h2>
			</div>`,
			`<div class="stack-4">
				<div class="rail__card" style="background:var(--canvas)">
					<div class="rail__title">${ICON.cal} When</div>
					<div style="font-size:.9375rem;color:var(--s800)">${esc(t.due)}</div>
					<div style="font-size:.875rem;color:var(--s500)">Recurring · Kids</div>
				</div>
				<div class="rail__card" style="background:var(--canvas)">
					<div class="rail__title">Notes</div>
					<div style="font-size:.875rem;color:var(--s600)">Added from quick capture. Tap Edit to add details, recurrence, or an assignee.</div>
				</div>
			</div>`,
			`<button class="btn btn-soft btn-md" data-sheet="close">Close</button>
			 <span style="flex:1"></span>
			 <button class="btn btn-token btn-md" data-sheet="complete">${ICON.check} Mark done</button>`
		);
	}

	function openOverflow(day) {
		const evs = evsFor(day);
		const tsks = tskFor(day);
		showSheet(
			`<div>
				<h2 style="margin:0;font-size:1.25rem;font-weight:800">${MONTHS_SHORT[state.month - 1]} ${day}</h2>
				<p class="hint" style="margin:.25rem 0 0">${evs.length} event${evs.length === 1 ? '' : 's'} · ${tsks.length} task${tsks.length === 1 ? '' : 's'}</p>
			</div>`,
			`<div class="stack-2">${evs.map((e) => chipHTML(e, { showTime: true, showBox: state.selectMode, selected: state.picked.has(e.id) })).join('')}${tsks.map((t) => taskChipHTML(t, { showBox: state.selectMode, selected: state.picked.has(t.id) })).join('')}</div>`,
			`<button class="btn btn-soft btn-md" data-sheet="close">Close</button><span style="flex:1"></span><button class="btn btn-primary btn-md" data-sheet="add-here">${ICON.plus} Add on this day</button>`
		);
	}

	/* create/edit form — Event⇄Task tabs + NLP quick add (parity with EventFormModal) */
	function openForm(day, presetDate) {
		const d = presetDate ?? day ?? state.activeDay;
		let tab = 'event';
		showSheet(
			`<div>
				<h2 style="margin:0;font-size:1.25rem;font-weight:800">New on ${MONTHS_SHORT[state.month - 1]} ${d}</h2>
				<p class="hint" style="margin:.25rem 0 0">Quick add parses dates, times, people and places.</p>
			</div>`,
			`<div class="stack-4" id="formBody">
				<div class="seg seg--tint" style="width:100%">
					<button class="seg__btn is-active" data-tab="event" style="flex:1;justify-content:center">${ICON.cal} Event</button>
					<button class="seg__btn" data-tab="task" style="flex:1;justify-content:center">${ICON.check} Task</button>
				</div>
				<div class="card card-tint-mint" style="padding:.75rem;border-radius:1rem">
					<div class="rowflex gap-2">
						<span style="color:var(--mint-ink);flex:none">${ICON.spark}</span>
						<input class="input" style="border:0;background:transparent;padding:.25rem" placeholder="Lunch Friday at noon with John" />
					</div>
					<div class="hint" style="padding-left:1.75rem">Parsed instantly — “every Tuesday”, “in 2 weeks”, “at 7pm” all work.</div>
				</div>
				<div id="formFields"></div>
			</div>`,
			`<button class="btn btn-soft btn-md" data-sheet="clear">Clear</button>
			 <button class="btn btn-ghost btn-md" data-sheet="del" style="color:#dc2626;box-shadow:inset 0 0 0 2px #fecaca">Delete</button>
			 <span style="flex:1"></span>
			 <button class="btn btn-token btn-md" data-sheet="save">Save</button>`
		);
		renderFormFields(tab);
		$$('[data-tab]').forEach((b) =>
			b.addEventListener('click', () => {
				$$('[data-tab]').forEach((x) => x.classList.remove('is-active'));
				b.classList.add('is-active');
				renderFormFields(b.dataset.tab);
			})
		);
	}

	function renderFormFields(tab) {
		const host = $('#formFields');
		if (!host) return;
		host.innerHTML =
			tab === 'task'
				? `<label class="field"><span class="field__l">What needs doing</span><input class="input" placeholder="e.g. Sign permission slip" /></label>
				   <div class="rowflex gap-3">
				     <label class="field" style="flex:1"><span class="field__l">Due date</span><input class="input" type="date" value="${iso(state.year, state.month, Math.min(state.today + 1, 28))}" /></label>
				     <label class="field" style="flex:1"><span class="field__l">Priority</span><select class="input"><option>Normal</option><option>High</option><option>Urgent</option></select></label>
				   </div>
				   <label class="rowflex gap-2" style="font-size:.875rem;color:var(--s700)"><input type="checkbox" style="height:1rem;width:1rem" /> Recurring task</label>
				   <label class="rowflex gap-2" style="font-size:.875rem;color:var(--s700)"><input type="checkbox" style="height:1rem;width:1rem" /> Shared with family</label>`
				: `<label class="field"><span class="field__l">Title</span><input class="input" placeholder="e.g. Soccer practice" /></label>
				   <div class="rowflex gap-3">
				     <label class="field" style="flex:1"><span class="field__l">Date</span><input class="input" type="date" value="${iso(state.year, state.month, state.activeDay)}" /></label>
				     <label class="field" style="flex:1"><span class="field__l">Starts</span><input class="input" type="time" value="09:00" /></label>
				     <label class="field" style="flex:1"><span class="field__l">Ends</span><input class="input" type="time" value="10:00" /></label>
				   </div>
				   <div class="rowflex gap-3">
				     <label class="field" style="flex:1"><span class="field__l">Calendar</span><select class="input">${CALENDARS.map((c) => `<option>${c.name}</option>`).join('')}</select></label>
				     <label class="field" style="flex:1"><span class="field__l">Repeat</span><select class="input"><option>Does not repeat</option><option>Daily</option><option>Weekly</option><option>Monthly</option><option>Yearly</option></select></label>
				   </div>
				   <label class="field"><span class="field__l">Where</span><input class="input" placeholder="Search a place…" /></label>
				   <span class="field__l" style="display:block;margin-bottom:.375rem">Who</span>
				   <div class="rowflex gap-2" style="flex-wrap:wrap">
				     <span class="pill pill-xs pill-blush">J · You ×</span><span class="pill pill-xs pill-blue">S · Sarah ×</span>
				     <button class="pill pill-xs btn-soft">+ Add</button>
				   </div>
				   <button class="chip__more" style="margin-top:.75rem">Show more ▾</button>`;
	}

	/* sheet plumbing */
	let sheetEl = null;
	function showSheet(head, body, foot) {
		closeSheet();
		const scrim = document.createElement('div');
		scrim.className = 'sheet-scrim';
		scrim.dataset.scrim = '1';
		scrim.addEventListener('click', closeSheet);
		document.body.appendChild(scrim);

		sheetEl = document.createElement('div');
		sheetEl.className = 'sheet';
		sheetEl.innerHTML = `<div class="sheet__grab"></div>
			<div class="sheet__head">${head}
				<button class="btn-icon sheet__x" data-sheet="close" aria-label="Close" style="position:absolute;right:.75rem;top:.75rem">${ICON.close}</button>
			</div>
			<div class="sheet__body">${body}</div>
			<div class="sheet__foot">${foot}</div>`;
		document.body.appendChild(sheetEl);

		sheetEl.addEventListener('click', (e) => {
			const a = e.target.closest('[data-sheet]');
			if (!a) return;
			const act = a.dataset.sheet;
			if (act === 'close' || act === 'save' || act === 'complete' || act === 'dup' || act === 'edit' || act === 'clear' || act === 'del') closeSheet();
			if (act === 'save') toast(`${ICON.check} Saved to ${MONTHS_SHORT[state.month - 1]} ${state.activeDay}`);
			if (act === 'complete') toast(`${ICON.check} Task done — nice work`);
			if (act === 'dup') toast('Duplicated — opening the new event');
			if (act === 'del') toast('Deleted. Undo is not wired in this prototype.', 'Undo');
			if (act === 'add-here') closeSheet();
		});
		document.addEventListener('keydown', escClose);
	}
	function escClose(e) { if (e.key === 'Escape') closeSheet(); }
	function closeSheet() {
		$$('.sheet, .sheet-scrim').forEach((n) => n.remove());
		sheetEl = null;
		document.removeEventListener('keydown', escClose);
	}

	/* toast */
	function toast(msg, action) {
		$$('.toast').forEach((n) => n.remove());
		const t = document.createElement('div');
		t.className = 'toast';
		t.innerHTML = `<span>${msg}</span>${action ? `<button class="btn" style="background:transparent;color:var(--terracotta);font-size:.8125rem;padding:.25rem .5rem">${action}</button>` : ''}`;
		document.body.appendChild(t);
		setTimeout(() => t.remove(), 3200);
	}

	/* range-select pill (drag a slot in week/day view) */
	function showRangePill(anchor) {
		let pill = $('#rangePill');
		if (pill) pill.remove();
		let startMin = 9 * 60, endMin = 10 * 60;
		pill = document.createElement('div');
		pill.id = 'rangePill';
		pill.className = 'rangepill';
		const paint = () => {
			pill.innerHTML = `<span class="tnum">${to12(minsToHHMM(startMin))} – ${to12(minsToHHMM(endMin))}</span>
				<button data-step="-15">−15</button><button data-step="15">+15</button>
				<button class="go" data-create="1">Create</button><button data-dismiss="1" aria-label="Dismiss">✕</button>`;
			pill.style.left = `${anchor.x - 130}px`;
			pill.style.top = `${anchor.y - 60}px`;
		};
		pill.addEventListener('click', (e) => {
			const st = e.target.closest('[data-step]');
			if (st) {
				const d = +st.dataset.step;
				if (d < 0 && startMin > 0) { startMin += d; endMin = Math.max(endMin + d, startMin + 15); }
				if (d > 0) endMin += d;
				paint();
				return;
			}
			if (e.target.closest('[data-create]')) {
				pill.remove();
				toast(`${ICON.check} Draft slot ${to12(minsToHHMM(startMin))} opened`);
				return;
			}
			if (e.target.closest('[data-dismiss]')) pill.remove();
		});
		document.body.appendChild(pill);
		paint();
	}

	/* ------------------------------------------------------- bulk bar   */
	function renderBulk() {
		$$('.bulkbar, .bulkbar-scrim').forEach((n) => n.remove());
		if (!state.selectMode || state.picked.size === 0) return;

		const n = state.picked.size;
		const bar = document.createElement('div');
		bar.className = 'bulkbar';
		bar.innerHTML = `
			<span style="font-size:.8125rem;font-weight:700;white-space:nowrap">${n} selected</span>
			<span class="sep"></span>
			<button data-bulk="del" style="height:2.25rem;padding:0 .875rem;border-radius:9999px;border:0;background:rgba(248,113,113,.18);color:#fca5a5;font:600 .8125rem inherit;cursor:pointer;white-space:nowrap">Delete</button>
			<select data-bulk="move" style="white-space:nowrap"><option>Move to…</option>${CALENDARS.map((c) => `<option>${c.name}</option>`).join('')}</select>
			<input data-bulk="loc" placeholder="Set location…" style="width:9rem" />
			<input data-bulk="att" placeholder="Add people…" style="width:8rem" />
			<button data-bulk="plan" style="height:2.25rem;padding:0 .875rem;border-radius:9999px;border:0;background:rgba(196,233,218,.2);color:#a7e8d0;font:600 .8125rem inherit;cursor:pointer;white-space:nowrap">${ICON.spark} Smart plan</button>
			<button data-bulk="more" style="height:2.25rem;width:2.25rem;border-radius:9999px;border:0;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;display:grid;place-items:center">${ICON.chevD}</button>
			<span class="sep"></span>
			<button data-bulk="exit" style="height:2.25rem;width:2.25rem;border-radius:9999px;border:0;background:transparent;color:rgba(255,255,255,.6);cursor:pointer;font-weight:800">✕</button>`;
		document.body.appendChild(bar);

		bar.addEventListener('click', (e) => {
			const b = e.target.closest('[data-bulk]')?.dataset.bulk;
			if (!b) return;
			if (b === 'exit') { state.selectMode = false; state.picked.clear(); draw(); return; }
			if (b === 'del') { toast(`Would confirm deleting ${n} item${n === 1 ? '' : 's'}`); return; }
			if (b === 'move') { toast(`Moved ${n} item${n === 1 ? '' : 's'} — undo available`); state.picked.clear(); draw(); return; }
			if (b === 'plan') { showBulkPlan(n); return; }
			if (b === 'more') { toast('More tools: shift dates, copy, export, print…'); }
		});
		bar.addEventListener('change', (e) => {
			if (e.target.dataset.bulk === 'move') {
				toast(`Moved ${n} item${n === 1 ? '' : 's'} to ${e.target.value} — undo available`);
				state.picked.clear();
				draw();
			}
		});
	}

	/* Smart-plan dry run — mirrors BulkEditBar's two-phase apply */
	function showBulkPlan(n) {
		showSheet(
			`<div>
				<span class="pill pill-xs pill-mint">Preview — nothing is saved yet</span>
				<h2 style="margin:.5rem 0 0;font-size:1.25rem;font-weight:800">Smart plan for ${n} item${n === 1 ? '' : 's'}</h2>
			</div>`,
			`<div class="stack-3">
				<div class="rail__card" style="background:#fffbeb;border-color:#fde68a">
					<div class="rail__title" style="color:#b45309">Heads up</div>
					<div style="font-size:.875rem;color:#92400e">2 of these land in the past. The plan will flag them rather than silently moving them.</div>
				</div>
				${[
					{ n: 'Move 4 items to next week', w: 'Keeps weekday + time-of-day' },
					{ n: 'Move 2 past-dated items to this week', w: 'Flagged — needs your call' },
					{ n: 'Align 3 tasks to 9:00 AM', w: 'Only shifts the due time' }
				]
					.map(
						(p) => `<div class="nextrow">
							<span class="nextrow__rail" style="background:var(--mint)"></span>
							<span style="flex:1">
								<span class="nextrow__n" style="display:block">${p.n}</span>
								<span class="nextrow__m" style="display:block">${p.w}</span>
							</span>
						</div>`
					)
					.join('')}
			</div>`,
			`<button class="btn btn-soft btn-md" data-sheet="close">Cancel</button>
			 <span style="flex:1"></span>
			 <button class="btn btn-token btn-md" data-sheet="apply">Apply plan</button>`
		);
		$$('[data-sheet="apply"]').forEach((b) =>
			b.addEventListener('click', () => {
				toast(`${ICON.check} Plan applied to ${n} item${n === 1 ? '' : 's'}`);
				state.picked.clear();
				draw();
			})
		);
	}

	/* ------------------------------------------------------------- draw  */
	function draw() {
		viewHost.innerHTML =
			state.view === 'month' ? monthView() : state.view === 'week' ? weekView() : state.view === 'day' ? dayView() : listView();

		$$('[data-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.view === state.view));
		if (viewSwitchHost) {
			viewSwitchHost.querySelectorAll('[data-view]').forEach((b) =>
				b.classList.toggle('is-active', b.dataset.view === state.view)
			);
		}
		$$('[data-mode]').forEach((b) => {
			const on = b.dataset.mode === 'select' ? state.selectMode : state.addMode;
			b.classList.toggle('is-active', on);
			b.setAttribute('aria-pressed', String(on));
		});
		const fab = $('#fab');
		if (fab) fab.style.display = state.selectMode ? 'none' : 'grid';
		if (legendHost) legendHost.innerHTML = legend();
		if (railHost && railMode) {
			const up = railHost.querySelector('#upcoming') ?? railHost;
			up.innerHTML = upcomingRail(5) || '<p class="hint">Nothing else this month.</p>';
			const mn = railHost.querySelector('#miniMonth');
			if (mn) paintMiniMonth(mn);
		}
		renderMonthHeader();
		renderNav();
		renderBulk();
		if (state.view === 'week' || state.view === 'day') {
			const sc = $('#wkScroll');
			if (sc) sc.scrollTop = 6.5 * 44;
		}
	}

	function paintMiniMonth(host) {
		const cells = monthGridTrimmed(state.year, state.month, firstDow);
		const busy = new Set(events.map((e) => e.day));
		host.innerHTML =
			dowRow(firstDow).map((d) => `<div class="mini__dow">${d[0]}</div>`).join('') +
			cells
				.map((c) => {
					const isT = c.d === state.today && c.m === state.month && c.y === state.year;
					const isS = c.d === state.activeDay && c.m === state.month;
					return `<button class="mini__d${c.outside ? ' is-out' : ''}${isT ? ' is-today' : ''}${isS && !isT ? ' is-sel' : ''}${!c.outside && busy.has(c.d) ? ' has-ev' : ''}" data-mini="${c.d}" data-mm="${c.m}" data-yy="${c.y}">${c.d}</button>`;
				})
				.join('');
	}

	/* ----------------------------------------------------------- events  */
	document.addEventListener('click', (e) => {
		const t = e.target;

		// nav
		const act = t.closest('[data-act]')?.dataset.act;
		if (act === 'prev') { shiftMonth(-1); return; }
		if (act === 'next') { shiftMonth(1); return; }
		if (act === 'today') { state.today = start.d; state.activeDay = start.d; state.year = start.y; state.month = start.m; draw(); toast('Back to today'); return; }
		if (act === 'back') { state.view = 'month'; draw(); return; }
		if (act === 'new-day' || act === 'new') { openForm(); return; }

		// views
		const v = t.closest('[data-view]')?.dataset.view;
		if (v) { state.view = v; draw(); return; }

		// modes
		const md = t.closest('[data-mode]')?.dataset.mode;
		if (md === 'select') { state.selectMode = !state.selectMode; state.addMode = false; state.picked.clear(); draw(); return; }
		if (md === 'add') { state.addMode = !state.addMode; state.selectMode = false; state.picked.clear(); draw(); return; }

		// filters
		const f = t.closest('[data-filter]')?.dataset.filter;
		if (f) {
			state.hidden.has(f) ? state.hidden.delete(f) : state.hidden.add(f);
			draw();
			toast(state.hidden.has(f) ? 'Hidden' : 'Shown');
			return;
		}

		// per-cell add
		const add = t.closest('[data-add]');
		if (add) { e.stopPropagation(); openForm(+add.dataset.add); return; }

		// overflow
		const ov = t.closest('[data-overflow]');
		if (ov) { e.stopPropagation(); openOverflow(+ov.dataset.overflow); return; }

		// chips
		const evb = t.closest('[data-ev]');
		if (evb) {
			e.stopPropagation();
			const ev = events.find((x) => x.id === evb.dataset.ev);
			if (!ev) return;
			if (state.selectMode) {
				state.picked.has(ev.id) ? state.picked.delete(ev.id) : state.picked.add(ev.id);
				draw();
			} else openEventSheet(ev);
			return;
		}
		const tb = t.closest('[data-task]');
		if (tb) {
			e.stopPropagation();
			const task = TASKS.find((x) => x.id === tb.dataset.task);
			if (!task) return;
			if (state.selectMode) {
				state.picked.has(task.id) ? state.picked.delete(task.id) : state.picked.add(task.id);
				draw();
			} else openTaskSheet(task);
			return;
		}

		// mini month
		const mini = t.closest('[data-mini]');
		if (mini) {
			const m = +mini.dataset.mm, y = +mini.dataset.yy;
			if (m !== state.month || y !== state.year) { state.month = m; state.year = y; }
			state.activeDay = +mini.dataset.mini;
			if (state.view === 'day') draw(); else { state.view = 'day'; draw(); }
			return;
		}

		// cell tap -> day view (or action sheet on narrow)
		const cell = t.closest('.cal-cell');
		if (cell) {
			state.activeDay = +cell.dataset.day;
			if (+cell.dataset.m !== state.month) { state.month = +cell.dataset.m; state.year = +cell.dataset.y; }
			if (state.selectMode) return;
			if (window.innerWidth < 640) { openDayActionSheet(state.activeDay); return; }
			if (state.view === 'month') { state.view = 'day'; }
			draw();
		}
	});

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && state.selectMode) { state.selectMode = false; state.picked.clear(); draw(); }
		if (e.key === 'ArrowLeft' && !sheetEl) shiftMonth(-1);
		if (e.key === 'ArrowRight' && !sheetEl) shiftMonth(1);
	});

	/* range drag in week/day grid */
	viewHost.addEventListener('mousedown', (e) => {
		const col = e.target.closest('.wk__col, .wk-day-drop');
		if (!col || state.selectMode) return;
		if (e.target.closest('.wk__ev')) return;
		// Ignore clicks on the chrome above the grid (headers, all-day strip).
		const wrap = col.closest('[style*="height"]');
		const wrapRect = wrap ? wrap.getBoundingClientRect() : null;
		if (wrapRect && wrapRect.height > 0 && (e.clientY < wrapRect.top || e.clientY > wrapRect.bottom)) return;
		showRangePill({ x: e.clientX, y: e.clientY });
	});

	/* horizontal swipe (month view, as in Calendar.svelte) */
	let tx = 0, ty = 0;
	viewHost.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
	viewHost.addEventListener('touchend', (e) => {
		if (state.view !== 'month') return;
		const dx = e.changedTouches[0].clientX - tx;
		const dy = e.changedTouches[0].clientY - ty;
		if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) shiftMonth(dx < 0 ? 1 : -1);
	}, { passive: true });

	function shiftMonth(n) {
		let m = state.month + n, y = state.year;
		if (m < 1) { m = 12; y--; }
		if (m > 12) { m = 1; y++; }
		state.month = m; state.year = y;
		draw();
	}

	function openDayActionSheet(day) {
		showSheet(
			`<div><h2 style="margin:0;font-size:1.125rem;font-weight:800">${MONTHS_SHORT[state.month - 1]} ${day}</h2>
			 <p class="hint" style="margin:.25rem 0 0">${evsFor(day).length} event${evsFor(day).length === 1 ? '' : 's'} · ${tskFor(day).length} task${tskFor(day).length === 1 ? '' : 's'}</p></div>`,
			`<div class="stack-2">${evsFor(day).map((e) => chipHTML(e)).join('')}${tskFor(day).map((t) => taskChipHTML(t)).join('') || '<p class="hint">Nothing planned.</p>'}</div>`,
			`<button class="btn btn-soft btn-md" data-sheet="close">Close</button><span style="flex:1"></span>
			 <a class="btn btn-soft btn-md" href="#daydash">Dashboard</a>
			 <button class="btn btn-primary btn-md" data-sheet="add-here">${ICON.plus} Add</button>`
		);
	}

	/* ------------------------------------------------------------- boot  */
	draw();

	// scroll week/day to "now" once more, after layout
	requestAnimationFrame(() => {
		const sc = $('#wkScroll');
		if (sc) sc.scrollTop = 6.5 * 44;
	});

	return { state, draw, toast, openForm, openEventSheet };
}

/* ---------------------------------------------------------------- utils */
function hexRgb(hex) {
	const h = hex.replace('#', '');
	const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
	return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
function rgba(hex, a) { return `rgba(${hexRgb(hex)}, ${a})`; }
function minsToHHMM(m) {
	const mm = ((m % 1440) + 1440) % 1440;
	return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}
function dow(c) {
	return (new Date(c.y ?? 2026, (c.m ?? 1) - 1, c.d).getDay());
}

export { $, $$, durLabel, to12, rgba, iso };
