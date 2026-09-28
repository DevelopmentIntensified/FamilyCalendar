/* Headless smoke test: renders every view of the shell in jsdom so we catch
   render-time errors without a browser. Run: node prototypes/calendar-ui/smoke.mjs */
import { JSDOM } from 'jsdom';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://x.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);

const { mount } = await import(pathToFileURL(join(here, 'proto-shell.js')).href);

let failures = 0;
function check(name, fn) {
	try {
		const out = fn();
		const n = typeof out === 'string' ? out.length : out;
		if (!n) throw new Error('empty render');
		console.log(`  ok   ${name.padEnd(26)} ${typeof n === 'number' ? n + ' chars' : n}`);
	} catch (e) {
		failures++;
		console.log(`  FAIL ${name.padEnd(26)} ${e.message}`);
	}
}

/* One live mount, driven through every view and every interaction. */
{
	const host = document.createElement('div');
	const legend = document.createElement('div');
	const nav = document.createElement('div');
	const rail = document.createElement('div');
	const mini = document.createElement('div');
	mini.id = 'miniMonth';
	const up = document.createElement('div');
	up.id = 'upcoming';
	rail.append(mini, up);
	const lbl = document.createElement('span');
	lbl.setAttribute('data-mlabel', '');
	document.body.append(host, legend, nav, rail, lbl);
	const api = mount({ viewHost: host, legendHost: legend, navHost: nav, railHost: rail, railMode: true });

	check('every view renders', () => {
		const out = [];
		for (const v of ['month', 'week', 'day', 'list']) {
			api.state.view = v;
			api.draw();
			const n = host.querySelectorAll('.chip, .wk__ev, .nextrow').length;
			if (!n) throw new Error(`${v} rendered nothing`);
			out.push(`${v}=${n}`);
		}
		api.state.view = 'month';
		api.draw();
		return out.join(' ');
	});

	check('rail paints mini month + up next', () => {
		if (!mini.children.length) throw new Error('mini month empty');
		if (!up.innerHTML.trim()) throw new Error('up next empty');
		return `${mini.children.length} mini cells, ${up.querySelectorAll('.nextrow').length} upcoming`;
	});

	check('month grid cells', () => {
		const cells = host.querySelectorAll('.cal-cell').length;
		if (cells !== 35) throw new Error(`expected 35 cells, got ${cells}`);
		return cells;
	});
	check('month chips', () => host.querySelectorAll('.chip').length);
	check('legend rows', () => legend.querySelectorAll('.legend__row').length);
	check('today cell marked', () => host.querySelectorAll('.cal-cell.is-today').length);
	check('overflow buttons', () => host.querySelectorAll('[data-overflow]').length);
	check('per-cell add', () => host.querySelectorAll('[data-add]').length);

	check('week view', () => {
		api.state.view = 'week'; api.draw();
		if (!host.querySelector('.wk')) throw new Error('no .wk');
		return host.querySelectorAll('.wk__ev').length;
	});
	check('week now-line', () => host.querySelectorAll('.wk__now').length);
	check('week day columns', () => host.querySelectorAll('.wk__col').length);

	check('day view', () => {
		api.state.view = 'day'; api.draw();
		if (!host.querySelector('.wk')) throw new Error('no .wk');
		return host.querySelectorAll('.wk__ev').length;
	});

	check('list view', () => {
		api.state.view = 'list'; api.draw();
		return host.querySelectorAll('.nextrow').length;
	});

	check('select mode', () => {
		api.state.view = 'month'; api.state.selectMode = true; api.draw();
		if (!host.querySelector('.cal-cell.selecting')) throw new Error('no selecting class');
		if (!host.querySelector('.chip__box')) throw new Error('no select checkboxes');
		return host.querySelectorAll('.chip__box').length;
	});

	check('bulk bar appears on pick', () => {
		host.querySelector('.chip[data-ev]').click();
		const bar = document.querySelector('.bulkbar');
		if (!bar) throw new Error('no bulk bar');
		const label = bar.textContent.trim().slice(0, 20);
		if (!/1 selected/.test(bar.textContent)) throw new Error('wrong count: ' + label);
		return bar.querySelectorAll('[data-bulk]').length + ' tools';
	});

	check('bulk bar hides on exit', () => {
		document.querySelector('[data-bulk="exit"]').click();
		if (document.querySelector('.bulkbar')) throw new Error('bulk bar persisted');
		if (api.state.selectMode) throw new Error('still in select mode');
		return 'ok';
	});

	check('smart plan is a dry run first', () => {
		api.state.selectMode = true; api.draw();
		host.querySelector('.chip[data-ev]').click();
		document.querySelector('[data-bulk="plan"]').click();
		const body = document.querySelector('.sheet__body').textContent;
		if (!/nothing is saved yet/i.test(document.querySelector('.sheet__head').textContent)) {
			throw new Error('no preview marker');
		}
		if (!/past/i.test(body)) throw new Error('no past-date warning');
		document.querySelector('[data-sheet="apply"]').click();
		if (document.querySelector('.bulkbar')) throw new Error('bulk bar not cleared after apply');
		api.state.selectMode = false;
		return 'ok';
	});

	check('filters hide a calendar', () => {
		api.state.selectMode = false;
		api.state.hidden.add('work');
		api.draw();
		const chip = [...host.querySelectorAll('.chip')].some((c) => c.textContent.includes('Team standup'));
		if (chip) throw new Error('work event still rendered');
		return 'hidden ok';
	});
	api.state.hidden.clear();

	check('event sheet opens', () => {
		api.draw();
		host.querySelector('.chip[data-ev]').click();
		if (!document.querySelector('.sheet')) throw new Error('no sheet');
		const t = document.querySelector('.sheet__head').textContent;
		document.querySelector('[data-sheet="close"]').click();
		if (document.querySelector('.sheet')) throw new Error('sheet did not close');
		return t.trim().slice(0, 40);
	});

	check('task sheet opens', () => {
		host.querySelector('.chip[data-task]').click();
		if (!document.querySelector('.sheet')) throw new Error('no sheet');
		document.querySelector('[data-sheet="close"]').click();
		return 'ok';
	});

	check('overflow sheet opens', () => {
		host.querySelector('[data-overflow]').click();
		if (!document.querySelector('.sheet')) throw new Error('no sheet');
		document.querySelector('[data-sheet="close"]').click();
		return 'ok';
	});

	check('create form + tabs', () => {
		api.openForm(12);
		if (!document.querySelector('#formFields')) throw new Error('no form fields');
		document.querySelector('[data-tab="task"]').click();
		const t = document.querySelector('#formFields').textContent;
		if (!t.includes('What needs doing')) throw new Error('task tab did not swap');
		document.querySelector('[data-sheet="close"]').click();
		return 'ok';
	});

	check('range pill', () => {
		api.state.view = 'week'; api.draw();
		const col = host.querySelector('.wk__col');
		col.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, clientX: 400, clientY: 400 }));
		if (!document.querySelector('#rangePill')) throw new Error('no range pill');
		const before = document.querySelector('#rangePill').textContent;
		document.querySelector('#rangePill [data-step="15"]').click();
		const after = document.querySelector('#rangePill').textContent;
		if (before === after) throw new Error('stepper did not move the range');
		document.querySelector('#rangePill [data-dismiss]').click();
		if (document.querySelector('#rangePill')) throw new Error('pill did not dismiss');
		return `${before.trim()} -> ${after.trim()}`;
	});

	check('month nav', () => {
		api.state.view = 'month'; api.draw();
		const read = () => lbl.textContent;
		document.querySelector('[data-act="next"]').click();
		const a = read();
		document.querySelector('[data-act="prev"]').click();
		document.querySelector('[data-act="prev"]').click();
		const b = read();
		if (a === b) throw new Error('nav did not change month');
		if (a !== 'October 2026' || b !== 'August 2026') throw new Error(`got ${a} / ${b}`);
		document.querySelector('[data-act="today"]').click();
		return `${a} -> ${b} -> ${read()}`;
	});

	check('navHost renders today/prev/next', () => {
		nav.innerHTML = '';
		api.draw();
		const want = ['today', 'prev', 'next'];
		const have = want.filter((k) => nav.querySelector(`[data-act="${k}"]`));
		if (have.length !== 3) throw new Error(`missing ${want.filter((k) => !have.includes(k))}`);
		return 'ok';
	});

	check('keyboard nav', () => {
		api.draw();
		document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		return 'ok';
	});
}

console.log(failures ? `\n${failures} FAILURES` : '\nall green');
process.exit(failures ? 1 : 0);
