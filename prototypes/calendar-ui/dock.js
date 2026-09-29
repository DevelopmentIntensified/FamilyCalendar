/* ============================================================================
   The dock — one collapsible launcher for both pieces of prototype chrome.

   There used to be two bars competing for the same screen: the feedback
   toolbar and the prototype switcher. Two bars is one too many, so they
   collapse into this:

        ┌──────────┐            ┌──────────────┐
        │ ✛   3    │  click     │ ▸ Review   3 │   click Review
        └──────────┘ ─────────► └──────────────┘ ─────────► the review bar
          the dock               the menu                   opens above the dock

   The dock is the only permanently-visible chrome, and it is the only thing
   you drag. Panels are placed relative to it, so moving the dock moves
   everything. One movable thing beats two.

   Self-contained: injects its own CSS, no imports, no build step. Load order
   does not matter — the dock waits for feedback.js and proto-nav.js to build
   their panels, and degrades to whatever it finds.

     <script src="dock.js"></script>

   It talks to the rest of the tool through exactly two things:
     · a 'proto-fb:change' CustomEvent from feedback.js  (how many are marked)
     · the DOM (.fb-bar, .proto-switch)                    (what to open)
   Neither side imports the other, so either can be absent.
   ========================================================================== */
(function () {
	'use strict';

	var KEY = 'proto-dock:open';   // was the menu open when we last left?
	var GAP = 10;                  // px between the dock and an open panel

	/* ------------------------------------------------------------------ css */
	var CSS = [
		'.fb-dock{position:fixed;right:1rem;bottom:1rem;z-index:210;',
		'display:flex;align-items:center;gap:.375rem;height:2.25rem;padding:0 .125rem 0 .125rem;',
		'border-radius:9999px;background:#1f2937;color:#fff;cursor:grab;',
		'box-shadow:0 12px 28px -8px rgba(0,0,0,.5);font:600 .75rem/1 ui-sans-serif,system-ui,sans-serif;',
		'-webkit-user-select:none;user-select:none;touch-action:none;transition:transform .15s,box-shadow .15s}',
		'.fb-dock:hover{box-shadow:0 16px 34px -8px rgba(0,0,0,.55)}',
		'.fb-dock:active{cursor:grabbing}',
		'.fb-dock[data-dragged="1"]{cursor:grabbing}',
		'.fb-dock:focus-visible{outline:2px solid #a78bfa;outline-offset:2px}',
		'@media (min-width:640px){.fb-dock{right:1.5rem;bottom:1.5rem}}',
		'.fb-dock[data-menu="1"]{transform:scale(1.04)}',
		'.fb-dock__hit{display:grid;place-items:center;width:2rem;height:2rem;border-radius:9999px;',
		'background:transparent;border:0;color:inherit;cursor:pointer;padding:0}',
		'.fb-dock__hit:hover{background:rgba(255,255,255,.12)}',
		'.fb-dock__hit svg{width:1rem;height:1rem;display:block}',
		'.fb-dock[data-panel] .fb-dock__hit svg{transform:rotate(45deg)}',
		'.fb-dock__hit svg{transition:transform .18s}',
		'.fb-dock__n{display:grid;place-items:center;min-width:1.125rem;height:1.125rem;padding:0 .25rem;',
		'border-radius:9999px;background:#7c3aed;font:800 .625rem/1 inherit}',
		'.fb-dock__n[hidden]{display:none}',
		'.fb-dock__n[data-zero="1"]{background:rgba(255,255,255,.18)}',
		/* the menu */
		'.fb-dock__menu{position:absolute;right:0;bottom:calc(100% + .5rem);min-width:13.5rem;',
		'padding:.25rem;border-radius:.875rem;background:#1f2937;color:#fff;',
		'box-shadow:0 20px 40px -12px rgba(0,0,0,.6);display:none;flex-direction:column;gap:.125rem}',
		'.fb-dock__menu[data-open="1"]{display:flex}',
		'.fb-dock[data-dragged="1"] .fb-dock__menu{position:fixed;right:auto;bottom:auto}',
		'.fb-dock__item{display:flex;align-items:center;gap:.5rem;width:100%;padding:.5rem .625rem;',
		'border:0;border-radius:.625rem;background:transparent;color:#fff;text-align:left;',
		'font:600 .8125rem/1 inherit;cursor:pointer}',
		'.fb-dock__item:hover{background:rgba(255,255,255,.1)}',
		'.fb-dock__item:focus-visible{outline:2px solid #a78bfa;outline-offset:-2px}',
		'.fb-dock__item svg{width:.9375rem;height:.9375rem;flex:none;opacity:.7}',
		'.fb-dock__item b{font-weight:600}',
		'.fb-dock__item .fb-dock__meta{margin-left:auto;font:600 .6875rem/1 inherit;opacity:.6;',
		'font-variant-numeric:tabular-nums}',
		'.fb-dock__sep{height:1px;background:rgba(255,255,255,.12);margin:.125rem .25rem}',
		'.fb-dock__tip{padding:.375rem .625rem .25rem;font:500 .625rem/1.4 inherit;opacity:.45}'
	].join('');

	function injectStyle() {
		if (document.getElementById('fb-dock-style')) return;
		var s = document.createElement('style');
		s.id = 'fb-dock-style';
		s.textContent = CSS;
		(document.head || document.documentElement).appendChild(s);
	}

	/* ---------------------------------------------------------------- icons */
	var ICON = {
		cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
		pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.2 7-11a7 7 0 10-14 0c0 5.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
		grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
		tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h4v4H4zM4 15h4v4H4zM16 10h4v4h-4zM8 7h4a2 2 0 012 2v2M8 17h4a2 2 0 002-2v-2"/></svg>',
		check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
	};

	function h(tag, attrs, kids) {
		var n = document.createElement(tag);
		if (attrs) Object.keys(attrs).forEach(function (k) {
			if (k === 'class') n.className = attrs[k];
			else if (k === 'html') n.innerHTML = attrs[k];
			else if (k === 'text') n.textContent = attrs[k];
			else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
			else n.setAttribute(k, attrs[k]);
		});
		(kids || []).forEach(function (c) { if (c) n.appendChild(c); });
		return n;
	}

	function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

	/* ----------------------------------------------------------------- state */
	var dock, menu, countEl, hitEl;
	var openPanel = null;     // 'bar' | 'switch' | null
	var menuOpen = false;
	var stats = { marked: 0, round: 1 };

	function bar() { return document.querySelector('.fb-bar'); }
	function switcher() { return document.querySelector('.proto-switch'); }

	/* ------------------------------------------------------------- panels */
	/**
	 * Park a panel just above the dock. The dock is the anchor because the
	 * user moved the dock — the panel should follow it, not sit wherever the
	 * stylesheet put it.
	 */
	function place(panel) {
		if (!panel || !dock) return;
		var d = dock.getBoundingClientRect();
		if (!d.width) return;
		panel.dataset.dockPlaced = '1';
		panel.style.left = 'auto';
		panel.style.right = 'auto';
		panel.style.transform = 'none';
		panel.style.bottom = (window.innerHeight - d.top + GAP) + 'px';
		// clamp horizontally now that we know the panel's width
		var p = panel.getBoundingClientRect();
		var left = clamp(d.left, 4, Math.max(4, window.innerWidth - p.width - 4));
		panel.style.left = left + 'px';
		panel.style.bottom = 'auto';
		panel.style.top = (d.top - p.height - GAP) + 'px';
	}

	function show(which) {
		var target = which === 'switch' ? switcher() : bar();
		if (!target) return false;
		// one at a time — two bars is what we just collapsed
		if (openPanel && openPanel !== which) hide();
		openPanel = which;
		target.hidden = false;
		if (which === 'switch') target.classList.add('is-open');
		place(target);
		dock.setAttribute('data-panel', which);
		hitEl.setAttribute('aria-label', 'Close the ' + (which === 'switch' ? 'prototype switcher' : 'review toolbar'));
		hitEl.setAttribute('aria-expanded', 'true');
		return true;
	}

	function hide() {
		[bar(), switcher()].forEach(function (n) {
			if (!n) return;
			n.hidden = true;
			if (n.classList.contains('is-open')) n.classList.remove('is-open');
		});
		openPanel = null;
		dock.removeAttribute('data-panel');
		hitEl.setAttribute('aria-label', 'Prototype tools');
		hitEl.setAttribute('aria-expanded', 'false');
	}

	function togglePanel(which) {
		if (openPanel === which) { hide(); return; }
		if (!show(which)) return;
		setMenu(false);
		// move focus to the panel we just opened, so keyboard users land in it
		var t = which === 'switch' ? switcher() : bar();
		if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); }
	}

	/* ---------------------------------------------------------------- menu */
	function setMenu(on) {
		menuOpen = on;
		menu.setAttribute('data-open', on ? '1' : '0');
		dock.setAttribute('data-menu', on ? '1' : '0');
		hitEl.setAttribute('aria-expanded', on ? 'true' : 'false');
		if (!openPanel) hitEl.setAttribute('aria-label', on ? 'Close the prototype tools' : 'Prototype tools');
		try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private mode */ }
		if (on) {
			paintCount();
			// a dragged dock is position:absolute-ish, so the menu must be told
			// where to sit rather than hanging off the bottom edge
			if (dock.dataset.dragged === '1') {
				var d = dock.getBoundingClientRect();
				var m = menu.getBoundingClientRect();
				menu.style.left = clamp(d.left, 4, Math.max(4, window.innerWidth - m.width - 4)) + 'px';
				menu.style.top = (d.top - m.height - 6) + 'px';
			}
			var first = menu.querySelector('.fb-dock__item');
			if (first) first.focus({ preventScroll: true });
		}
	}

	function paintCount() {
		var n = stats.marked;
		countEl.textContent = n > 99 ? '99+' : String(n);
		countEl.hidden = n === 0;
		countEl.setAttribute('data-zero', n === 0 ? '1' : '0');
		var review = menu.querySelector('[data-meta="review"]');
		if (review) {
			review.textContent = n === 0 ? 'nothing marked' : n + (n === 1 ? ' mark' : ' marks');
		}
		var sw = menu.querySelector('[data-meta="switch"]');
		if (sw && switcher()) {
			var on = switcher().querySelector('.proto-switch__btn.is-active .proto-switch__short');
			sw.textContent = on ? on.textContent.trim() : 'open';
		}
	}

	/* --------------------------------------------------------------- build */
	function item(icon, label, meta, onPick) {
		return h('button', { class: 'fb-dock__item', type: 'button', onclick: onPick }, [
			h('span', { html: icon }),
			h('b', { text: label }),
			h('span', { class: 'fb-dock__meta', 'data-meta': meta, text: '' })
		]);
	}

	/* Approving is a PAGE-level decision, so it lives in the overlay and the
	 * dock only asks for it. Reversible by design: a second click withdraws
	 * it, because a judgement gets revised before anyone writes code. The
	 * page with no overlay loaded still renders a dead item rather than
	 * throwing — a dock that breaks a page without feedback.js is worse than
	 * a menu item that does nothing. */
	function approveItem() {
		var btn = h('button', { class: 'fb-dock__item fb-dock__item--approve', type: 'button', onclick: onApproveClick }, [
			h('span', { html: ICON.check }),
			h('b', { text: 'Approve for building' }),
			h('span', { class: 'fb-dock__meta', 'data-meta': 'approve', text: '' })
		]);
		paintApprove(btn);
		return btn;
	}
	function fb() { return window.__protoFb || null; }
	function paintApprove(btn) {
		var api = fb();
		var on = !!(api && api.approved());
		btn.classList.toggle('is-approved', on);
		btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		var meta = btn.querySelector('[data-meta="approve"]');
		if (meta) meta.textContent = !api ? 'no overlay' : on ? 'approved' : 'not approved';
		btn.setAttribute('aria-label', on ? 'Withdraw approval for building' : 'Approve for building');
	}
	function onApproveClick(e) {
		e.stopPropagation();
		var api = fb();
		if (!api || typeof api.toggleApproved !== 'function') return;
		api.toggleApproved();
		paintApprove(e.currentTarget);
		if (menuOpen) setMenu(false);
	}
	/* Keep the item honest when the overlay's own events fire. */
	document.addEventListener('proto-fb:change', function () {
		var b = menu && menu.querySelector('.fb-dock__item--approve');
		if (b) paintApprove(b);
	});

	function build() {
		if (document.querySelector('.fb-dock')) return;
		injectStyle();

		dock = h('div', { class: 'fb-dock', role: 'button', tabindex: '0', 'aria-expanded': 'false', 'aria-label': 'Prototype tools' });
		menu = h('div', { class: 'fb-dock__menu', role: 'menu' });

		hitEl = h('button', { class: 'fb-dock__hit', type: 'button', 'aria-label': 'Prototype tools', 'aria-expanded': 'false', html: ICON.cross });
		countEl = h('span', { class: 'fb-dock__n', text: '0', hidden: true, title: 'marks on this page' });

		hitEl.addEventListener('click', function (e) {
			e.stopPropagation();
			if (openPanel) { hide(); return; }
			setMenu(!menuOpen);
		});
		dock.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
				if (e.target === hitEl) return;   // the button handles its own
				e.preventDefault();
				setMenu(!menuOpen);
			}
		});

		menu.appendChild(item(ICON.pin, 'Review', 'review', function () { togglePanel('bar'); }));
		menu.appendChild(item(ICON.grid, 'Switch prototype', 'switch', function () { togglePanel('switch'); }));
		menu.appendChild(approveItem());
		menu.appendChild(h('span', { class: 'fb-dock__sep' }));
		menu.appendChild(h('a', { class: 'fb-dock__item', href: '../index.html', role: 'menuitem' }, [
			h('span', { html: ICON.tree }),
			h('b', { text: 'All prototypes' }),
			h('span', { class: 'fb-dock__meta', text: 'tree' })
		]));
		menu.appendChild(h('div', { class: 'fb-dock__tip', text: 'Esc closes · M toggles · drag to move' }));

		dock.appendChild(hitEl);
		dock.appendChild(countEl);
		dock.appendChild(menu);
		document.body.appendChild(dock);

		// the dock is the one movable thing
		if (window.__protoDrag) window.__protoDrag(dock, 'dock');

		paintCount();
	}

	/* ---------------------------------------------------------------- wiring */
	function onFbChange(e) {
		stats = e.detail || stats;
		paintCount();
	}

	function onKey(e) {
		if (e.key === 'Escape') {
			if (menuOpen) { setMenu(false); hitEl.focus({ preventScroll: true }); return; }
			if (openPanel) { hide(); hitEl.focus({ preventScroll: true }); }
			return;
		}
		// M toggles the dock, unless the user is typing or already in a panel
		if ((e.key === 'm' || e.key === 'M') && !openPanel && !typing(e) && !e.metaKey && !e.ctrlKey) {
			e.preventDefault();
			setMenu(!menuOpen);
		}
	}

	function typing(e) {
		var t = e && e.target;
		return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
	}

	function onDocClick(e) {
		if (!menuOpen) return;
		if (e.target.closest && e.target.closest('.fb-dock')) return;
		setMenu(false);
	}

	/**
	 * feedback.js and proto-nav.js both build their panel after us, and neither
	 * guarantees when. Retry a few times, then stop — a dock with no panels is
	 * still useful (it opens the tree and shows the count).
	 */
	function wire() {
		var b = bar(), s = switcher();
		if (!b && !s) return false;
		// hide BOTH panels until the dock is asked for them. The switcher is
		// built by proto-nav.js, which appends it visible — so this has to
		// happen here rather than being each panel's own default.
		if (!openPanel) {
			if (b) b.hidden = true;
			if (s) { s.hidden = true; s.classList.remove('is-open'); }
		}
		paintCount();
		return true;
	}

	function start() {
		build();
		document.addEventListener('proto-fb:change', onFbChange);
		document.addEventListener('click', onDocClick, true);
		document.addEventListener('keydown', onKey, true);

		if (wire()) return;
		var tries = 0;
		var iv = setInterval(function () {
			tries++;
			if (wire() || tries > 40) clearInterval(iv);   // ~2s is plenty
		}, 50);

		// re-place an open panel if the window changes size
		window.addEventListener('resize', function () {
			if (openPanel) place(openPanel === 'switch' ? switcher() : bar());
		});
	}

	// remember the menu state across reloads
	function restore() {
		try { if (localStorage.getItem(KEY) === '1') setMenu(true); } catch (e) { /* ignore */ }
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { start(); restore(); });
	else { start(); restore(); }
})();
