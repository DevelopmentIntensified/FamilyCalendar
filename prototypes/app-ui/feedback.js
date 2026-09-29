/* ============================================================================
   Prototype feedback overlay
   ----------------------------------------------------------------------------
   Link into any prototype page:

     <link rel="stylesheet" href="feedback.css" />
     <script src="feedback.js" defer></script>

   Optional but recommended — mark the structural regions so a fine-grained
   selection still carries a coarse handle the agent can grep for:

     <section data-fb="toolbar" data-fb-label="Toolbar"> … </section>

   Interaction (stagewise for picking, BugHerd for pins):
     click          select the element under the cursor
     alt + click    select its parent (coarser)
     shift + click  add to / remove from the selection
     esc            leave picking
     F              toggle the toolbar

   Verdict is the point: good / bad / idea. "bad" is what the agent rebuilds.
   Everything autosaves. GET /__feedback reads back; POST /__feedback writes.
   Without the collector it falls back to localStorage and says so.
   ========================================================================== */
(function () {
	'use strict';

	var ENDPOINT = '/__feedback';
	var STYLE_KEYS = ['display', 'position', 'flexDirection', 'gap', 'padding', 'margin',
		'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor',
		'borderRadius', 'border', 'boxShadow', 'width', 'height', 'opacity', 'zIndex'];

	var ICON = {
		cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>',
		thumbsUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 22V10M7 10l4.5-7a2 2 0 013 2l-1 4h5.2a2 2 0 012 2.3l-1.2 7A2 2 0 0117.5 20H7z"/></svg>',
		thumbsDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2v12M7 14l4.5 7a2 2 0 003-2l-1-4h5.2a2 2 0 002-2.3l-1.2-7A2 2 0 0017.5 4H7z"/></svg>',
		bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a6 6 0 00-3.5 10.9c.5.4.8 1 .9 1.6h5.2c.1-.6.4-1.2.9-1.6A6 6 0 0012 2z"/></svg>'
	};

	var VERDICTS = [
		{ v: 'good', label: 'Good', key: '1', icon: ICON.thumbsUp },
		{ v: 'bad', label: 'Bad', key: '2', icon: ICON.thumbsDown },
		{ v: 'idea', label: 'Idea', key: '3', icon: ICON.bulb }
	];

	/* ------------------------------------------------------------- utils */
	function $(s, r) { return (r || document).querySelector(s); }
	function esc(s) {
		return String(s).replace(/[&<>"`]/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '`': '&#96;' }[c];
		});
	}
	/** Key on the PATH, not the bare filename.
	 *  Two prototype sets can both ship an index.html, and one shared store
	 *  keyed on the basename silently merges their notes into a single
	 *  record — which defeats the whole point of knowing which prototype a
	 *  note is about. */
	function pageFile() {
		var segs = location.pathname.split('/').filter(Boolean);
		// only a segment that looks like a file is the page; anything else
		// means we are on a directory, whose key is the index inside it
		if (!/\.html?$/.test(segs[segs.length - 1] || '')) segs.push('index.html');
		return segs.join('/') || 'index.html';
	}
	function typing(e) {
		var t = e && e.target;
		return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
	}
	function debounce(fn, ms) {
		var t;
		return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
	}
	function el(tag, attrs, kids) {
		var n = document.createElement(tag);
		if (attrs) Object.keys(attrs).forEach(function (k) {
			// on* must be assigned as a property or the button is dead
			if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') n[k] = attrs[k];
			else if (k === 'class') n.className = attrs[k];
			else if (k === 'text') n.textContent = attrs[k];
			else if (k === 'html') n.innerHTML = attrs[k];
			else if (attrs[k] === true) n.setAttribute(k, '');
			else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
		});
		(kids || []).forEach(function (c) { if (c) n.appendChild(c); });
		return n;
	}
	function boxOf(n) {
		var r = n.getBoundingClientRect();
		return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
	}
	function stylesOf(n) {
		var cs, out = {};
		try { cs = getComputedStyle(n); } catch (e) { return out; }
		STYLE_KEYS.forEach(function (k) { if (cs[k]) out[k] = cs[k]; });
		return out;
	}
	function shortHTML(n) {
		var h = n.outerHTML || '';
		var inner = h.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>$/, '');
		if (inner.length < 40 && h.length > 220) h = h.slice(0, 220) + '…';
		else if (h.length > 400) h = h.slice(0, 400) + '…';
		return h;
	}

	/* ------------------------------------------------------------ picking */
	/** Never pick the overlay itself. */
	function isChrome(n) {
		return !!(n && n.closest && n.closest('.fb-bar, .fb-card, .fb-list, .fb-status, .fb-hint, .fb-pin-layer, .fb-dock, .proto-switch, .proto-nav'));
	}
	/** Skip elements with no area — invisible spacers aren't reviewable. */
	function pickable(n) {
		if (!n || n.nodeType !== 1 || isChrome(n)) return false;
		if (n.tagName === 'HTML' || n.tagName === 'BODY' || n.tagName === 'HEAD') return false;
		if (n.hasAttribute('hidden')) return false;
		return true;
	}
	/** Walk up to the nearest enclosing data-fb region, if any. */
	function regionOf(n) {
		var r = n.closest ? n.closest('[data-fb]') : null;
		if (!r) return null;
		return { selector: '[data-fb="' + r.getAttribute('data-fb') + '"]', label: r.getAttribute('data-fb-label') || r.getAttribute('data-fb') };
	}

	/** A CSS path specific enough for the agent to find it again. */
	function cssPath(n, stopAt) {
		var parts = [], cur = n, depth = 0;
		while (cur && cur.nodeType === 1 && depth++ < 7) {
			if (stopAt && cur === stopAt) { parts.unshift('[data-fb="' + stopAt.getAttribute('data-fb') + '"]'); break; }
			if (cur.id) { parts.unshift('#' + cur.id); break; }
			var fb = cur.getAttribute && cur.getAttribute('data-fb');
			if (fb) { parts.unshift('[data-fb="' + fb + '"]'); break; }
			var seg = cur.localName;
			var cls = (cur.className && typeof cur.className === 'string')
				? cur.className.trim().split(/\s+/).filter(function (c) { return c && c.length < 30; }).slice(0, 2)
				: [];
			if (cls.length) seg += '.' + cls.map(function (c) { return c.replace(/[^\w-]/g, ''); }).join('.');
			var p = cur.parentElement;
			if (p) {
				var sibs = [].slice.call(p.children).filter(function (s) { return s.localName === cur.localName; });
				if (sibs.length > 1) seg += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
			}
			parts.unshift(seg);
			cur = cur.parentElement;
		}
		return parts.join(' > ');
	}

	function describe(n) {
		var tag = n.localName;
		var cls = (n.className && typeof n.className === 'string') ? n.className.trim().split(/\s+/).filter(Boolean) : [];
		var id = n.id ? '#' + n.id : '';
		var b = boxOf(n);
		return {
			tag: tag,
			classes: cls.slice(0, 6),
			text: (n.innerText || n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 140),
			box: b,
			summary: '<' + tag + id + (cls.length ? '.' + cls.slice(0, 2).join('.') : '') + '> ' + b.w + '×' + b.h
		};
	}

	function capture(n) {
		var reg = regionOf(n);
		var stop = reg ? n.closest('[data-fb]') : null;
		return {
			id: 'e' + (Date.now().toString(36)) + Math.random().toString(36).slice(2, 5),
			region: reg ? reg.selector : null,
			regionLabel: reg ? reg.label : null,
			selector: cssPath(n, stop),
			tag: n.localName,
			classes: describe(n).classes,
			text: describe(n).text,
			box: boxOf(n),
			styles: stylesOf(n),
			html: shortHTML(n),
			verdict: '',
			note: '',
			redo: false
		};
	}

	/* ------------------------------------------------------------ identity
	   A review that says only "a-warm-studio.html" is useless to whoever reads
	   it — they cannot tell which direction it was, what it was trying, or how
	   it relates to its siblings. So the page declares itself and that travels
	   with the feedback.

	   Add to each prototype page:
	     <script type="application/json" id="fb-page">
	       { "id": "a", "label": "Prototype A · Warm Studio",
	         "family": "calendar-ui",
	         "question": "…what this is testing…",
	         "thesis":  "…the approach…",
	         "risk":    "…what could go wrong…", "status": "candidate" }
	     </script>
	   */
	function pageIdentity() {
		var n = document.getElementById('fb-page');
		if (!n) return {};
		try {
			var d = JSON.parse(n.textContent);
			return (d && typeof d === 'object') ? d : {};
		} catch (e) {
			console.warn('[proto-feedback] #fb-page is not valid JSON:', e.message);
			return {};
		}
	}
	var IDENTITY = {};

	/* -------------------------------------------------------------- state
	   ONE store for every prototype, keyed by page, and each page holds a LIST
	   OF ROUNDS rather than one set of marks.

	   Rounds are what make this iterative. A review is a conversation over
	   several passes, and the interesting part is the *sequence*: what I was
	   asked to fix, what I did, what is still wrong. Flattening that to "the
	   current marks" throws away exactly the information that makes round 3
	   useful.

	   So: the user reviews → hits "Done reviewing" → the round closes → the
	   next pass opens a fresh one and the old one stays. I close a round from
	   the other end with an outcome (read.mjs --close), so the record reads:

	     round 1  bad×2  →  done     "folded the toolbar into one row"
	     round 2  bad×1  →  open     the legend is still stranded

	   `items` is always the OPEN round's array — never reassign it, mutate it in
	   place so the store stays the single source of truth. */
	var LS_KEY = 'proto-fb:v1';
	var store = { version: 2, pages: {} };
	var items = [];
	var picking = false;
	var openId = null;
	var transport = 'unknown';

	function key() { return pageFile(); }

	function newRoundId() {
		return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
	}

	/** Wrap a bare `items` array (older store, or the old per-page shape). */
	function asRound(r, fallbackPage) {
		return {
			id: r.id || newRoundId(),
			openedAt: r.openedAt || new Date().toISOString(),
			closedAt: r.closedAt || null,
			status: r.status || 'open',
			outcome: r.outcome || '',
			page: r.page || fallbackPage || '',
			items: Array.isArray(r.items) ? r.items : []
		};
	}

	function roundsOf(k) {
		k = k || key();
		return (store.pages[k] && store.pages[k].rounds) || [];
	}
	function openRound(k) {
		k = k || key();
		var r = roundsOf(k).filter(function (x) { return x.status === 'open'; })[0];
		if (r) return r;
		return null;
	}
	/** Every page that has marks in any round, closed or open. */
	function pagesWithMarks() {
		return Object.keys(store.pages).filter(function (k) {
			return roundsOf(k).some(function (r) { return r.items.length; });
		}).sort();
	}
	function totalMarks() {
		return pagesWithMarks().reduce(function (n, k) {
			return n + roundsOf(k).reduce(function (m, r) { return m + r.items.length; }, 0);
		}, 0);
	}
	function countVerdict(pageKey, v) {
		return roundsOf(pageKey).reduce(function (n, r) {
			return n + r.items.filter(function (i) { return i.verdict === v; }).length;
		}, 0);
	}

	function record(k) {
		k = k || key();
		if (!store.pages[k]) {
			store.pages[k] = { about: {}, url: '', title: '', viewport: '', rounds: [] };
		}
		var p = store.pages[k];
		if (!Array.isArray(p.rounds)) p.rounds = []; // migrate v1
		return p;
	}

	function saveLocal() {
		try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) { /* quota / private mode */ }
	}
	function loadLocal() {
		try {
			var raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
			if (raw && raw.pages) {
				Object.keys(raw.pages).forEach(function (k) {
					var p = raw.pages[k];
					if (!Array.isArray(p.rounds)) p.rounds = p.items ? [asRound({ items: p.items }, k)] : [];
					delete p.items;
					p.rounds = p.rounds.map(function (r) { return asRound(r, k); });
				});
				raw.version = 2;
				return raw;
			}
			// migrate the original per-path shape too
			var legacy = JSON.parse(localStorage.getItem('proto-fb:' + location.pathname) || 'null');
			if (Array.isArray(legacy) && legacy.length) {
				return { version: 2, pages: (function () {
					var p = {};
					p[pageFile()] = { about: {}, url: location.href, title: document.title, viewport: '', rounds: [asRound({ items: legacy }, pageFile())] };
					return p;
				})() };
			}
		} catch (e) { /* corrupt — start clean */ }
		return { version: 2, pages: {} };
	}

	function byId(id) { return items.filter(function (i) { return i.id === id; })[0]; }
	function indexOf(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return i; return -1; }

	/** Close the open round and start the next one. */
	function nextRound() {
		var rec = record();
		var cur = openRound();
		if (cur) {
			cur.status = 'closed';
			cur.closedAt = new Date().toISOString();
		}
		var r = asRound({ openedAt: new Date().toISOString(), page: key() });
		rec.rounds.push(r);
		openId = null;
		card.hidden = true;
		items = r.items;
		save();
		renderPins();
		renderBar();
		renderList();
		return r;
	}

	function payload() {
		var rec = record();
		rec.url = rec.url || location.href;
		rec.title = rec.title || document.title;
		rec.viewport = window.innerWidth + 'x' + window.innerHeight;
		return {
			page: pageFile(),
			// who this prototype is, so the review identifies it rather than
			// just naming a file. See pageIdentity() for the shape.
			about: rec.about,
			url: rec.url,
			title: rec.title,
			viewport: rec.viewport,
			updatedAt: new Date().toISOString(),
			// Page-level build decision (approved / withdrawn). Top-level on
			// purpose: the collector spreads the client record through, so it
			// survives to disk without the server knowing what it means.
			build: rec.build || null,
			// every round, oldest first. Closed rounds are sent too so a second
			// tab stays in sync, but the collector never lets the client drop one.
			rounds: rec.rounds
		};
	}

	/* ----------------------------------------------------------------- ui */
	var bar, hover, hoverTag, pinLayer, card, list, statusEl, hintEl, marksLayer;

	function build() {
		/* hover tracker ------------------------------------------------- */
		hover = el('div', { class: 'fb-hover' }, [hoverTag = el('div', { class: 'fb-hover__tag' })]);
		document.body.appendChild(hover);

		/* selection wash + pins ---------------------------------------- */
		marksLayer = el('div', { 'aria-hidden': 'true' });
		marksLayer.style.cssText = 'position:fixed;inset:0;z-index:128;pointer-events:none';
		document.body.appendChild(marksLayer);
		pinLayer = el('div', { class: 'fb-pin-layer' });
		document.body.appendChild(pinLayer);

		/* toolbar ------------------------------------------------------- */
		bar = el('div', { class: 'fb-bar' });
		bar.appendChild(el('button', {
			class: 'fb-bar__pick', type: 'button', 'aria-pressed': 'false', onclick: function () { setPicking(!picking); }
		}, [
			el('span', { html: ICON.cross }),
			el('span', { text: 'Select elements' }),
			el('span', { class: 'fb-bar__key', text: 'F' })
		]));
		bar.appendChild(el('span', { class: 'fb-bar__n', text: 'nothing marked' }));
		bar.appendChild(el('span', { class: 'fb-bar__sep' }));
		VERDICTS.forEach(function (v) {
			bar.appendChild(el('button', {
				class: 'fb-bar__tally', type: 'button', 'data-v': v.v,
				title: 'Show only "' + v.label.toLowerCase() + '"',
				onclick: function () { toggleFilter(v.v); }
			}, [el('span', { class: 'fb-bar__dot' }), el('b', { text: '0' })]));
		});
		bar.appendChild(el('span', { class: 'fb-bar__sep' }));
		bar.appendChild(el('button', { class: 'fb-bar__btn fb-bar__list', type: 'button', text: 'List', onclick: function () { toggleList(); } }));
		bar.appendChild(el('button', {
			class: 'fb-bar__btn fb-bar__round', type: 'button',
			title: 'Close this review pass and start the next one. Nothing is deleted — earlier rounds are kept.',
			onclick: function () { doNextRound(); }
		}, [el('span', { class: 'fb-bar__roundno' }), el('span', { text: 'New round' })]));
		bar.appendChild(el('button', {
			class: 'fb-bar__btn', type: 'button', text: 'Copy',
			title: 'Copy this page’s review as markdown',
			onclick: function () { copy(toMarkdown(false, 'page'), items.length + ' marked'); }
		}));
		bar.appendChild(el('button', { class: 'fb-bar__btn', type: 'button', text: 'Clear', onclick: clearAll }));
		document.body.appendChild(bar);

		// a persistent reminder of WHAT is being reviewed, right in the toolbar
		bar.appendChild(el('span', {
			class: 'fb-bar__who',
			title: (IDENTITY.question || '') + (IDENTITY.thesis ? '\n' + IDENTITY.thesis : ''),
			text: '· ' + whoami()
		}));

		// The dock owns dragging. It places this bar next to itself when it
		// opens it, so two independently movable bars is the thing we just
		// collapsed. drag.js refuses to attach here anyway when a dock exists;
		// this is the fallback for a page that has not loaded dock.js.
		if (window.__protoDrag && !document.querySelector('.fb-dock')) window.__protoDrag(bar, 'feedback');

		hintEl = el('div', { class: 'fb-hint', hidden: true });
		document.body.appendChild(hintEl);
		statusEl = el('div', { class: 'fb-status', hidden: true });
		document.body.appendChild(statusEl);

		/* comment card --------------------------------------------------- */
		card = el('div', { class: 'fb-card', hidden: true, role: 'dialog', 'aria-label': 'Comment' });
		document.body.appendChild(card);

		/* list ----------------------------------------------------------- */
		list = el('aside', { class: 'fb-list', hidden: true, 'aria-label': 'All marks' });
		document.body.appendChild(list);
	}

	/* ------------------------------------------------------------- status */
	var statusTimer;
	function status(text, tone, sticky) {
		clearTimeout(statusTimer);
		statusEl.textContent = text;
		statusEl.setAttribute('data-tone', tone || '');
		statusEl.hidden = false;
		if (!sticky) statusTimer = setTimeout(function () { statusEl.hidden = true; }, 3200);
	}

	/* ------------------------------------------------------------ picking */
	function setPicking(on) {
		picking = on;
		document.body.classList.toggle('fb-picking', on);
		$('.fb-bar__pick', bar).setAttribute('aria-pressed', String(on));
		hover.style.display = on ? 'block' : 'none';
		if (on) {
			hintEl.innerHTML = 'Click an element · <kbd>Alt</kbd>+click its parent · <kbd>Shift</kbd>+click to add · <kbd>Esc</kbd> to stop';
			hintEl.hidden = false;
		} else {
			hintEl.hidden = true;
		}
		if (!on && openId == null) closeCard();
	}

	/** The element to select for this event, honouring alt (coarser). */
	function targetFor(e) {
		var n = e.target;
		if (!pickable(n)) return null;
		if (e.altKey) {
			var p = n.parentElement;
			while (p && !pickable(p) && p !== document.body) p = p.parentElement;
			return p && p !== document.body ? p : n;
		}
		return n;
	}

	function onMove(e) {
		if (!picking) return;
		var n = targetFor(e);
		if (!n) { hover.style.display = 'none'; return; }
		var r = n.getBoundingClientRect();
		if (!r.width && !r.height) { hover.style.display = 'none'; return; }
		hover.style.display = 'block';
		hover.classList.toggle('is-alt', !!e.altKey);
		hover.style.left = r.left + 'px';
		hover.style.top = r.top + 'px';
		hover.style.width = r.width + 'px';
		hover.style.height = r.height + 'px';
		var d = describe(n);
		hoverTag.innerHTML = '<b>' + esc(d.tag) + '</b>' +
			(d.classes.length ? '<i>.' + esc(d.classes.slice(0, 2).join('.')) + '</i>' : '') +
			'<u>' + d.box.w + '×' + d.box.h + '</u>';
		hoverTag.style.maxWidth = Math.max(r.width, 120) + 'px';
	}

	function onClick(e) {
		if (!picking) return;
		var n = targetFor(e);
		if (!n) return;
		// swallow it: the page's own handlers must not fire
		e.preventDefault();
		e.stopPropagation();
		if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

		var sel = cssPath(n, n.closest('[data-fb]'));
		var existing = items.filter(function (i) { return i.selector === sel; })[0];
		if (e.shiftKey) {
			if (existing) { remove(existing.id); return; }
		} else if (existing) {
			openCard(existing.id);
			return;
		}
		var rec = capture(n);
		items.push(rec);
		openCard(rec.id);
		save();
	}

	/* --------------------------------------------------------------- pins */
	function renderPins() {
		pinLayer.innerHTML = '';
		marksLayer.innerHTML = '';
		items.forEach(function (it, i) {
			var node = resolve(it);
			// the element may be gone (view switched, DOM re-rendered). Keep the
			// mark in the list, just don't draw it.
			if (!node || !node.isConnected) return;
			var b = boxOf(node);
			if (!b.w && !b.h) return;

			var wash = el('div', { class: 'fb-marked', 'data-v': it.verdict || 'none' });
			wash.style.left = (b.x - 1) + 'px';
			wash.style.top = (b.y - 1) + 'px';
			wash.style.width = (b.w + 2) + 'px';
			wash.style.height = (b.h + 2) + 'px';
			marksLayer.appendChild(wash);

			var pin = el('button', {
				class: 'fb-pin' + (it.id === openId ? ' is-open' : ''),
				type: 'button', 'data-v': it.verdict || 'none', 'data-id': it.id,
				title: '<' + it.tag + '> — ' + (it.verdict || 'unmarked') + (it.note ? ' · ' + it.note.slice(0, 60) : ''),
				'aria-label': 'Mark ' + (i + 1) + ': <' + it.tag + '> ' + (it.verdict || 'unmarked'),
				onclick: function (ev) { ev.stopPropagation(); openCard(it.id); }
			}, [el('span', { text: String(i + 1) })]);
			pin.style.left = (b.x + b.w - 7) + 'px';
			pin.style.top = (b.y + 7) + 'px';
			pinLayer.appendChild(pin);
		});
	}

	/** Re-find the live element for a stored mark, by selector. */
	function resolve(it) {
		if (it._el && it._el.isConnected) return it._el;
		var host = it.region ? document.querySelector(it.region) : null;
		var scope = host || document;
		var el_ = null;
		try { el_ = scope.querySelector(it.selector); } catch (e) { el_ = null; }
		if (!el_ && it.selector.indexOf(' > ') > -1) {
			// the path was cut at the region root; retry against the tail
			var tail = it.selector.split(' > ').slice(1).join(' > ');
			try { el_ = scope.querySelector(tail); } catch (e2) { el_ = null; }
		}
		it._el = el_ || null;
		return el_;
	}

	/** Reposition everything; called on scroll/resize. */
	function sync() { renderPins(); if (openId != null) placeCard(); }

	/* --------------------------------------------------------------- card */
	function placeCard() {
		var it = byId(openId);
		if (!it) return;
		var node = resolve(it);
		var b = node ? boxOf(node) : (it.box || { x: 40, y: 80, w: 0, h: 0 });
		var cw = card.offsetWidth || 336, ch = card.offsetHeight || 240;
		var vw = window.innerWidth, vh = window.innerHeight;
		var left = Math.min(Math.max(8, b.x), vw - cw - 8);
		var top = b.y + b.h + 10;
		if (top + ch > vh - 8) top = Math.max(8, b.y - ch - 10);
		card.style.left = left + 'px';
		card.style.top = top + 'px';
	}

	function openCard(id) {
		var it = byId(id);
		if (!it) return;
		openId = id;
		var i = indexOf(id);
		var d = describe(resolve(it) || document.createElement('div'));
		card.setAttribute('data-v', it.verdict || 'none');
		card.innerHTML = '';

		card.appendChild(el('div', { class: 'fb-card__head' }, [
			el('span', { class: 'fb-card__n', text: String(i + 1) }),
			el('span', { class: 'fb-card__where' }, [
				el('span', { class: 'fb-card__el', text: '<' + esc(it.tag) + (it.classes.length ? '.' + esc(it.classes[0]) : '') + '>' + (it.regionLabel ? '  in ' + it.regionLabel : '') }),
				el('code', { class: 'fb-card__sel', text: it.selector, title: it.selector })
			]),
			el('button', { class: 'fb-card__x', type: 'button', text: '×', title: 'Delete this mark', onclick: function () { remove(id); } })
		]));

		var body = el('div', { class: 'fb-card__body' });

		var vs = el('div', { class: 'fb-verdicts', role: 'group', 'aria-label': 'Verdict' });
		VERDICTS.forEach(function (v) {
			vs.appendChild(el('button', {
				class: 'fb-v', type: 'button', 'data-v': v.v, 'aria-pressed': String(it.verdict === v.v),
				title: v.label + '  (key ' + v.key + ')',
				html: '<span>' + v.icon + '</span><span>' + v.label + '</span><span class="fb-bar__key">' + v.key + '</span>',
				onclick: function () { setVerdict(id, v.v); }
			}));
		});
		body.appendChild(vs);

		var ta = el('textarea', {
			class: 'fb-card__text', 'aria-label': 'Comment',
			placeholder: it.verdict === 'bad'
				? 'What is wrong, and what should it be instead?'
				: it.verdict === 'good'
					? 'What works here that should be kept or copied elsewhere?'
					: 'Say what you want to see here.'
		});
		ta.value = it.note || '';
		ta.addEventListener('input', function () { it.note = ta.value; save(); });
		ta.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') { e.stopPropagation(); closeCard(); }
			if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commit(id); }
		});
		body.appendChild(ta);

		var nav = el('div', { class: 'fb-card__nav' });
		nav.appendChild(el('span', { class: 'fb-card__count', text: (i + 1) + ' of ' + items.length }));
		nav.appendChild(el('button', { class: 'fb-card__navbtn', type: 'button', text: '‹', title: 'Previous (k)', onclick: function () { step(-1); } }));
		nav.appendChild(el('button', { class: 'fb-card__navbtn', type: 'button', text: '›', title: 'Next (j)', onclick: function () { step(1); } }));

		var redoLabel = el('label', { class: 'fb-redo', title: 'Ask the agent to rebuild this element' });
		var cb = el('input', { type: 'checkbox' });
		cb.checked = !!it.redo;
		cb.addEventListener('change', function () { it.redo = cb.checked; save(); });
		redoLabel.appendChild(cb);
		redoLabel.appendChild(el('span', { text: 'redo this' }));

		var foot = el('div', { class: 'fb-card__foot' }, [redoLabel, nav]);
		body.appendChild(foot);

		// the context the agent needs
		var kv = el('div', { class: 'fb-card__kv' });
		kv.appendChild(el('b', { text: 'selector' }));
		kv.appendChild(el('span', { text: it.selector }));
		kv.appendChild(el('b', { text: 'size' }));
		kv.appendChild(el('span', { text: (it.box.w || 0) + '×' + (it.box.h || 0) }));
		if (it.classes.length) {
			kv.appendChild(el('b', { text: 'classes' }));
			kv.appendChild(el('span', { text: it.classes.join(' ') }));
		}
		Object.keys(it.styles || {}).slice(0, 8).forEach(function (k) {
			kv.appendChild(el('b', { text: k }));
			kv.appendChild(el('span', { text: it.styles[k] }));
		});
		var meta = el('details', { class: 'fb-card__meta' }, [
			el('summary', { text: 'context for the agent' }),
			kv,
			el('div', { class: 'fb-card__html', text: it.html || '' })
		]);
		body.appendChild(meta);

		card.appendChild(body);
		card.hidden = false;
		renderPins();
		renderList();
		placeCard();
		var live = resolve(it);
		if (live && live.scrollIntoView) live.scrollIntoView({ block: 'nearest' });
		setTimeout(function () { ta.focus(); }, 0);
	}

	function closeCard() { openId = null; card.hidden = true; renderPins(); renderList(); }

	function step(dir) {
		if (!items.length) return;
		var i = indexOf(openId);
		var n = (i + dir + items.length) % items.length;
		openCard(items[n].id);
	}

	function setVerdict(id, v) {
		var it = byId(id);
		if (!it) return;
		it.verdict = it.verdict === v ? '' : v;
		// "bad" is a request to change, so it implies a redo unless told otherwise
		if (it.verdict === 'bad' && !it.note && !it._redoTouched) it.redo = true;
		save();
		openCard(id);
		renderPins();
	}

	function commit(id) {
		var it = byId(id);
		if (!it) return;
		if (!it.verdict && !it.note.trim()) { remove(id); return; }
		if (!it.verdict) it.verdict = 'idea';
		save();
		status(it.verdict === 'bad' ? 'Marked bad — this goes on the redo list.' : 'Marked ' + it.verdict + '.', 'ok');
		step(1);
	}

	function remove(id) {
		var i = indexOf(id);
		if (i < 0) return;
		items.splice(i, 1);
		if (openId === id) { openId = null; card.hidden = true; }
		save();
		if (items.length) openCard(items[Math.min(i, items.length - 1)].id);
		else closeCard();
	}

	/** Close the open round and start the next one. Nothing is deleted. */
	function doNextRound() {
		var cur = openRound();
		var n = cur ? cur.items.length : 0;
		if (n) {
			var bad = cur.items.filter(function (i) { return i.verdict === 'bad'; }).length;
			if (!confirm('Close round ' + roundNo() + '?\n\n' + n + ' marked · ' + bad + ' bad.\n\nThe round is kept as history. The next pass starts empty.')) return;
		}
		var r = nextRound();
		save();
		status('Round ' + (roundsOf().length - 1) + ' closed · round ' + roundsOf().length + ' open', 'ok');
		renderList();
	}

	/* --------------------------------------------------------------- list */
	var filter = null;
	var scope = 'page';

	function toggleFilter(v) {
		filter = filter === v ? null : v;
		if (!list.hidden) renderList();
		toggleList(true);
	}

	function toggleList(force) {
		var open = force == null ? list.hidden : force;
		list.hidden = !open;
		// The class is what actually reveals the panel: `.fb-list` is parked at
		// translateX(100%) and only `.is-open` brings it back. Setting `hidden`
		// alone leaves it in the DOM but off-screen to the right.
		list.classList.toggle('is-open', open);
		if (open) renderList();
	}

	function renderList() {
		list.innerHTML = '';
		var keys = scope === 'all' ? pagesWithMarks() : [key()];
		var n = keys.reduce(function (a, k) { return a + roundsOf(k).reduce(function (m, r) { return m + r.items.length; }, 0); }, 0);

		list.appendChild(el('div', { class: 'fb-list__head' }, [
			el('span', { class: 'fb-list__title', text: scope === 'all' ? 'All prototypes' : whoami() }),
			el('button', {
				class: 'fb-bar__btn', type: 'button', text: 'Copy',
				title: scope === 'all' ? 'Copy every prototype’s review' : 'Copy this page’s review',
				onclick: function () { copy(toMarkdown(false, scope), n + ' marked' + (scope === 'all' ? ' across ' + keys.length + ' pages' : '')); }
			}),
			el('button', {
				class: 'fb-bar__btn', type: 'button',
				text: scope === 'all' ? 'Only this page' : 'All (' + totalMarks() + ')',
				title: 'Switch between this page and every prototype',
				onclick: function () { scope = scope === 'all' ? 'page' : 'all'; renderList(); }
			}),
			el('button', { class: 'fb-bar__btn', type: 'button', text: 'Close', onclick: function () { toggleList(false); } })
		]));

		// what this page is, so a review copied from here identifies itself
		if (IDENTITY.question || IDENTITY.thesis) {
			var about = el('div', { class: 'fb-list__about' });
			if (IDENTITY.question) about.appendChild(el('p', {}, [el('b', { text: 'Question ' }), el('span', { text: IDENTITY.question })]));
			if (IDENTITY.thesis) about.appendChild(el('p', {}, [el('b', { text: 'Approach ' }), el('span', { text: IDENTITY.thesis })]));
			if (IDENTITY.risk) about.appendChild(el('p', {}, [el('b', { text: 'Risk ' }), el('span', { text: IDENTITY.risk })]));
			list.appendChild(about);
		}

		var filters = el('div', { class: 'fb-list__filters' });
		filters.appendChild(el('button', {
			class: 'fb-bar__btn', type: 'button', text: 'Any' + (filter ? '' : ' ✓'),
			style: filter ? '' : 'background:var(--fb-ink);color:#fff',
			onclick: function () { filter = null; renderList(); }
		}));
		VERDICTS.forEach(function (v) {
			var c = keys.reduce(function (a, k) { return a + countVerdict(k, v.v); }, 0);
			filters.appendChild(el('button', {
				class: 'fb-bar__btn', type: 'button', text: v.label + ' ' + c,
				style: filter === v.v ? 'background:var(--fb-ink);color:#fff' : '',
				onclick: function () { filter = filter === v.v ? null : v.v; renderList(); }
			}));
		});
		list.appendChild(filters);

		var body = el('div', { class: 'fb-list__body' });
		if (!n) {
			body.appendChild(el('div', {
				class: 'fb-list__empty',
				html: 'Click <b>Select elements</b> in the toolbar, then click anything on the page.<br/>Marks are kept in this browser, so you can review every prototype and copy the lot from here.'
			}));
			list.appendChild(body);
			return;
		}

		/** One page's marks, grouped by verdict. */
		function pageBlock(k) {
			var rec = record(k);
			var isThis = k === key();
			var rs = roundsOf(k).filter(function (r) { return r.items.length; });
			if (!rs.length) return null;

			var block = el('div', { class: 'fb-list__page' + (isThis ? ' is-current' : '') });
			var about = rec.about || {};
			block.appendChild(el('div', { class: 'fb-list__pagehead' }, [
				el('span', { class: 'fb-list__pagename', text: about.label || k }),
				el('span', { class: 'fb-list__pagen', text: rs.length + '×' })
			]));
			if (scope === 'all' && about.question) {
				block.appendChild(el('div', { class: 'fb-list__pageq', text: '> ' + about.question }));
			}
			if (!isThis) {
				block.appendChild(el('a', { class: 'fb-list__gopage', href: k, text: 'open ' + k + ' →' }));
			}

			// newest round first — that is the one being worked on
			rs.slice().reverse().forEach(function (r, ri) {
				var n = rs.length - ri;
				var isOpen = r.status === 'open' && isThis;
				var head = el('div', {
					class: 'fb-list__roundhead' + (isOpen ? ' is-open' : '') + (r.status === 'rejected' ? ' is-rejected' : ''),
					title: (r.openedAt || '') + (r.closedAt ? ' → ' + r.closedAt : '')
				}, [
					el('b', { text: 'r' + n }),
					el('span', { text: r.status === 'open' ? 'open' : (r.status || 'closed') }),
					el('span', { style: 'margin-left:auto;font-weight:500', text: r.items.length + ' marked' })
				]);
				block.appendChild(head);
				if (r.outcome) block.appendChild(el('div', { class: 'fb-list__outcome', text: '↳ ' + r.outcome }));

				var rows = filter ? r.items.filter(function (i) { return i.verdict === filter; }) : r.items;
				VERDICTS.concat([{ v: '', label: 'Unmarked' }]).forEach(function (g) {
					var gr = rows.filter(function (i) { return (i.verdict || '') === g.v; });
					if (!gr.length) return;
					var grp = el('div', { class: 'fb-list__group' });
					grp.appendChild(el('div', { class: 'fb-list__grouphead', text: g.label + ' · ' + gr.length }));
					gr.forEach(function (it) { grp.appendChild(rowFor(it, r, k, isThis)); });
					block.appendChild(grp);
				});
			});
			return block;
		}

		function rowFor(it, r, k, isThis) {
			var n = r.items.indexOf(it) + 1;
			return el('button', {
				class: 'fb-list__item' + (isThis && it.id === openId ? ' is-open' : ''),
				type: 'button', 'data-v': it.verdict || 'none',
				title: isThis && r.status === 'open' ? 'Edit this mark' : 'Open ' + k + ' to edit',
				onclick: function () {
					if (!isThis || r.status !== 'open') { location.href = k; return; }
					openCard(it.id);
					toggleList(false);
				}
			}, [
				el('span', { class: 'fb-list__el' }, [
					el('span', { text: n + '.' }),
					el('u', { text: '<' + it.tag + (it.classes.length ? '.' + it.classes[0] : '') + '>' }),
					el('span', { style: 'margin-left:auto;font-size:.625rem;color:#94a3b8', text: (it.box.w || 0) + '×' + (it.box.h || 0) })
				]),
				it.note ? el('div', { class: 'fb-list__note', text: it.note }) : null,
				it.regionLabel ? el('div', { class: 'fb-list__note', text: 'in ' + it.regionLabel }) : null
			]);
		}

		var shownAny = false;
		keys.forEach(function (k) {
			var b = pageBlock(k);
			if (b) { body.appendChild(b); shownAny = true; }
		});
		if (!shownAny) {
			body.appendChild(el('div', { class: 'fb-list__empty', html: 'Nothing marked <b>' + esc(filter) + '</b> yet.' }));
		}
		list.appendChild(body);
	}

	/* --------------------------------------------------------- transport */
	var save = debounce(function () {
		saveLocal();
		renderPins();
		renderBar();
		push(false);
	}, 400);

	/**
	 * Tell the dock how this page is doing, so the launcher badge can stay in
	 * sync without either side knowing about the other's DOM. Fired after every
	 * debounced save and once on boot.
	 */
	function announce() {
		try {
			document.dispatchEvent(new CustomEvent('proto-fb:change', {
				detail: {
					page: key(),
					marked: items.length,
					good: countVerdict(key(), 'good'),
					bad: countVerdict(key(), 'bad'),
					idea: countVerdict(key(), 'idea'),
					round: roundNo()
				}
			}));
		} catch (e) { /* CustomEvent unsupported — the dock just stays at its initial count */ }
	}

	function renderBar() {
		announce();
		var here = items.length;
		var total = totalMarks();
		var elsewhere = total - here;
		var rounds = roundsOf();
		$('.fb-bar__n', bar).textContent = here
			? 'r' + rounds.length + ' · ' + here + ' marked · ' + items.filter(function (i) { return i.redo; }).length + ' to rebuild' +
				(elsewhere ? ' · ' + elsewhere + ' elsewhere' : '')
			: elsewhere ? 'r' + rounds.length + ' · none here · ' + elsewhere + ' on other prototypes' : 'r' + rounds.length + ' · nothing marked';
		VERDICTS.forEach(function (v) {
			var b = $('.fb-bar__tally[data-v="' + v.v + '"]', bar);
			if (b) b.querySelector('b').textContent = String(items.filter(function (i) { return i.verdict === v.v; }).length);
		});
		$('.fb-bar__list', bar).textContent = 'List' + (elsewhere ? ' (' + total + ')' : '');
		var no = $('.fb-bar__roundno', bar);
		if (no) no.textContent = 'r' + (rounds.length + 1);
	}

	/** Wipe one page, or every page when scope === 'all'. */
	function clearAll() {
		if (scope === 'all') {
			var pages = pagesWithMarks();
			if (!pages.length) return;
			if (!confirm('Clear all ' + totalMarks() + ' marks across ' + pages.length + ' prototypes?\n\nEvery round, everywhere. This cannot be undone.')) return;
			var self = key();
			pages.forEach(function (k) {
				if (k === self) record(k).rounds = [];
				else delete store.pages[k];
			});
			items.length = 0;
		} else {
			if (!items.length) return;
			if (!confirm('Clear all ' + items.length + ' marks on ' + whoami() + '?')) return;
			items.length = 0;
		}
		openId = null;
		card.hidden = true;
		save();
		renderPins();
		renderList();
		status('Cleared.', 'ok');
	}

	function push(loud) {
		// persist first: if the collector is down the local copy must still be
		// current, and a caller that only ever calls push() would otherwise lose
		// whatever is still sitting in the debounce window
		saveLocal();
		if (!window.fetch) return;
		var answered = false;
		fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()) })
			.then(function (r) {
				answered = true;
				if (!r.ok) throw new Error('HTTP ' + r.status);
				transport = 'server';
				if (loud) status('Saved.', 'ok');
			})
			.catch(function (err) {
				transport = 'local';
				if (!loud) return;
				// A live collector that refused the write is not a collector that
				// is not running. Say which one it actually was.
				if (answered) { status('Saved in this browser only — the collector refused the write (' + (err && err.message || 'error') + '). Hit Copy and paste it into chat.', 'warn'); return; }
				status('Saved in this browser only — the collector is not running. Hit Copy and paste it into chat.', 'warn');
			});
	}

	function pull() {
		if (!window.fetch) { status('Offline — marks are kept in this browser only.', 'warn'); return; }
		// A response of ANY status proves the collector is UP. A 404 only means
		// this page has nothing collected yet, and calling that "collector not
		// running" made every never-reviewed page look like a broken setup.
		var answered = false;
		return fetch(ENDPOINT + '?page=' + encodeURIComponent(pageFile()))
			.then(function (r) {
				answered = true;
				transport = 'server';
				return r.ok ? r.json() : null;
			})
			.then(function (server) {
				if (server) {
					var rec = record();
					// Adopt the server's closed rounds we have never seen (a fresh
					// browser, or another machine). The OPEN round is ours: it is
					// whatever this tab has been marking into.
					var seen = {};
					rec.rounds.forEach(function (r) { seen[r.id] = true; });
					(server.rounds || []).forEach(function (r) {
						if (r && r.status !== 'open' && !seen[r.id]) rec.rounds.push(asRound(r, key()));
					});
					rec.rounds.sort(function (a, b) { return String(a.openedAt).localeCompare(String(b.openedAt)); });
					if (server.about && Object.keys(server.about).length) rec.about = server.about;
					saveLocal();
				}
				renderPins();
				renderBar();
				renderList();
			})
			.catch(function () {
				transport = 'local';
				// The collector replied but the payload was unusable. That is a
				// different problem from "not running", and must not claim it.
				if (answered) { status('Collector answered with something unreadable — marks are kept in this browser only.', 'warn'); return; }
				if (!items.length) status('Collector not running — marks are kept in this browser only. Hit Copy to share them.', 'warn');
			});
	}

	/* ---------------------------------------------------------- build state
	 * Approving a prototype is a PAGE-level decision, not a mark on an element,
	 * so it does not live in a round. It is reversible by design: a click
	 * toggles it, because "approved" is a judgement and judgements get revised
	 * before anyone writes code.
	 *
	 * The collector spreads the client record through, so a top-level `build`
	 * field survives to disk with no change on the server side.
	 */
	function buildState() {
		return record().build || null;
	}
	function isApproved() {
		var b = buildState();
		return !!(b && b.approved);
	}
	function setApproved(on) {
		var rec = record();
		if (!on) delete rec.build;
		else rec.build = { approved: true, approvedAt: new Date().toISOString() };
		save();
		renderBar();
		push(true);
		announce();
	}
	function toggleApproved() {
		var next = !isApproved();
		setApproved(next);
		status(next ? 'Approved for building — the tree can lock it in and raise tickets.'
					: 'Approval withdrawn.', next ? 'ok' : 'warn');
		return next;
	}

	/* -------------------------------------------------------------- copy */
	/** Human identity of this page, or a bare filename when undeclared. */
	function whoami() {
		return IDENTITY.label || pageFile();
	}

	/** How many review passes this page has been through. */
	function roundNo(k) {
		return roundsOf(k).length;
	}

	function headerFor(k) {
		var rec = store.pages[k] || record(k);
		var about = rec.about || {};
		var L = ['## ' + (about.label || k), ''];
		if (about.question) L.push('> **Question:** ' + about.question);
		if (about.thesis) L.push('> **Approach:** ' + about.thesis);
		if (about.risk) L.push('> **Risk:** ' + about.risk);
		if (L.length > 1) L.push('');
		L.push('_file: `' + k + '`' + (about.family ? ' · family: `' + about.family + '`' : '') + '_');
		return L;
	}

	function groupsOf() {
		return [
			{ v: 'bad', label: 'Bad — rebuild these' },
			{ v: 'good', label: 'Good — keep these' },
			{ v: 'idea', label: 'Ideas' },
			{ v: '', label: 'Marked, no verdict' }
		];
	}

	function roundBlock(r, n, onlyRedo) {
		var rows = onlyRedo ? r.items.filter(function (i) { return i.redo; }) : r.items;
		if (!rows.length && onlyRedo) return [];
		var L = [];
		var bad = rows.filter(function (i) { return i.verdict === 'bad'; }).length;
		var head = '### Round ' + n + (r.status === 'open' ? ' — open' : ' — ' + (r.status || 'closed'));
		L.push(head, '');
		L.push('_' + rows.length + ' marked · ' + bad + ' bad · ' + rows.filter(function (i) { return i.redo; }).length + ' to rebuild_ · started ' + (r.openedAt || '?') + '_');
		if (r.outcome) L.push('> **Outcome:** ' + r.outcome);
		if (rows.length) L.push('');

		groupsOf().forEach(function (g) {
			var group = rows.filter(function (i) { return (i.verdict || '') === g.v; });
			if (!group.length) return;
			L.push('#### ' + g.label + '  (' + group.length + ')');
			group.forEach(function (it) {
				var i = r.items.indexOf(it) + 1;
				L.push('**' + n + '.' + i + ' <' + it.tag + (it.classes.length ? '.' + it.classes.join('.') : '') + '>**' +
					(it.regionLabel ? ' _in ' + it.regionLabel + '_' : ''));
				L.push('- selector: `' + it.selector + '`');
				if (it.region) L.push('- region: `' + it.region + '`');
				L.push('- size: ' + (it.box.w || 0) + '×' + (it.box.h || 0) + 'px');
				if (it.text) L.push('- text: "' + it.text + '"');
				if (it.note) L.push('- note: ' + it.note);
				if (it.redo) L.push('- **REBUILD THIS**');
				L.push('');
			});
		});
		return L;
	}

	function sectionFor(k, onlyRedo) {
		var rs = roundsOf(k).filter(function (r) { return r.items.length || !onlyRedo; });
		if (!rs.length) return [];
		var L = headerFor(k);
		var all = rs.reduce(function (a, r) { return a.concat(r.items); }, []);
		L.push('_' + all.length + ' marks across ' + rs.length + ' round' + (rs.length === 1 ? '' : 's') +
			' · ' + all.filter(function (i) { return i.verdict === 'bad'; }).length + ' bad_', '');
		rs.forEach(function (r, idx) { L.push.apply(L, roundBlock(r, idx + 1, onlyRedo)); });
		return L;
	}

	/** scope: 'page' (default) or 'all' — across every prototype with marks. */
	function toMarkdown(onlyRedo, scope) {
		var keys = scope === 'all' ? pagesWithMarks() : [key()];
		var L = ['# Prototype review', ''];
		if (scope === 'all' && keys.length > 1) {
			L.push('_' + totalMarks() + ' marks across ' + keys.length + ' prototypes_', '');
		}
		keys.forEach(function (k) {
			var s = sectionFor(k, onlyRedo);
			L.push.apply(L, s.length ? s : ['## ' + (record(k).about.label || k), '', '_nothing to rebuild_', '']);
		});
		if (L.length <= 3) return 'No marks' + (onlyRedo ? ' flagged for rebuild' : '') + ' yet.';
		return L.join('\n');
	}

	function copy(text, what) {
		var done = function (ok) {
			status(ok ? 'Copied ' + what + ' to the clipboard.' : 'Copy failed — open the list and select the text.', ok ? 'ok' : 'err');
		};
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(legacy(text)); });
			return;
		}
		done(legacy(text));
		function legacy(t) {
			var ta = el('textarea', { style: 'position:fixed;left:-9999px' });
			ta.value = t;
			document.body.appendChild(ta);
			ta.select();
			var ok = false;
			try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
			ta.remove();
			return ok;
		}
	}

	/* ------------------------------------------------------------- public
	 * dock.js and this file have no shared API — the dock only ever read a
	 * count. Approving a page is a decision about the PAGE, so the decision
	 * lives here and the dock asks for it. Anything else that wants to drive
	 * the overlay (a tree page, a test) goes through this too. */
	window.__protoFb = {
		page: key,
		identity: function () { return IDENTITY; },
		counts: function () {
			return {
				marked: items.length,
				good: countVerdict(key(), 'good'),
				bad: countVerdict(key(), 'bad'),
				idea: countVerdict(key(), 'idea'),
				redo: items.filter(function (i) { return i.redo; }).length,
				rounds: roundNo()
			};
		},
		approved: isApproved,
		toggleApproved: toggleApproved,
		// Every mark on this page, for a tree page deciding what to raise.
		marks: function () {
			var out = [];
			roundsOf().forEach(function (r) { (r.items || []).forEach(function (i) { out.push(i); }); });
			return out;
		}
	};
	document.addEventListener('proto-fb:change', function (e) {
		document.dispatchEvent(new CustomEvent('proto-fb:stats', { detail: e.detail }));
	});

	/* -------------------------------------------------------------- boot */
	function start() {
		if (document.querySelector('.fb-bar')) return;
		IDENTITY = pageIdentity();
		store = loadLocal();

		// make sure the current page has a record, and refresh its identity
		var rec = record();
		if (Object.keys(IDENTITY).length) rec.about = IDENTITY;
		rec.url = rec.url || location.href;
		rec.title = rec.title || document.title;
		rec.viewport = window.innerWidth + 'x' + window.innerHeight;
		rec.updatedAt = new Date().toISOString();

		// Every page always has an open round to mark into; closed rounds are
		// never thrown away. Bind by reference — never reassign `items`.
		var cur = openRound();
		if (!cur) {
			cur = asRound({ openedAt: new Date().toISOString(), page: key() });
			rec.rounds.push(cur);
		}
		items = cur.items;

		build();

		// capture-phase so the page's own handlers never see our clicks
		document.addEventListener('mousemove', onMove, true);
		document.addEventListener('click', onClick, true);
		document.addEventListener('scroll', sync, true);
		window.addEventListener('resize', sync);

		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') {
				if (typing(e)) return;
				if (picking) { setPicking(false); return; }
				if (!list.hidden) { toggleList(false); return; }
				if (openId != null) closeCard();
				return;
			}
			// verdict keys apply to the open card
			if (openId != null && !typing(e) && !e.metaKey && !e.ctrlKey) {
				var v = VERDICTS.filter(function (x) { return x.key === e.key; })[0];
				if (v) { e.preventDefault(); setVerdict(openId, v.v); return; }
				if (e.key === 'j') { e.preventDefault(); step(1); return; }
				if (e.key === 'k') { e.preventDefault(); step(-1); return; }
			}
			if (typing(e)) return;
			if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault();
				setPicking(!picking);
			}
		});

		renderPins();
		renderBar();
		pull();

		window.__protoFeedback = {
			payload: payload,
			/** markdown(redoOnly, scope) — scope 'page' (default) or 'all' */
			markdown: function (redoOnly, scope) { return toMarkdown(redoOnly, scope); },
			items: function () { return items; },
			/** every prototype that has marks, with its declared identity and rounds */
			store: function () {
				return pagesWithMarks().map(function (k) {
					var r = record(k);
					return {
						page: k,
						about: r.about,
						rounds: r.rounds.length,
						count: r.rounds.reduce(function (n, x) { return n + x.items.length; }, 0),
						items: r.rounds.reduce(function (a, x) { return a.concat(x.items); }, [])
					};
				});
			},
			rounds: function () { return roundsOf(); },
			setScope: function (s) { scope = s === 'all' ? 'all' : 'page'; renderList(); return scope; },
			regions: function () {
				return [].slice.call(document.querySelectorAll('[data-fb]')).map(function (n) {
					return { selector: '[data-fb="' + n.getAttribute('data-fb') + '"]', label: n.getAttribute('data-fb-label') || n.getAttribute('data-fb') };
				});
			},
			pick: function (selector) {
				var n = document.querySelector(selector);
				if (!n) return false;
				var rec = capture(n);
				items.push(rec);
				openCard(rec.id);
				save();
				return rec;
			},
			setVerdict: function (id, v) { setVerdict(id, v); },
			push: function () { push(true); return Promise.resolve(true); }
		};
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
	else start();
})();
