/* ============================================================================
   Drag-to-reposition for the prototype chrome. Load BEFORE dock.js /
   feedback.js; all of them use it opportunistically via window.__protoDrag and
   no-op if it is absent.

     <script src="drag.js"></script>

   Design notes:
   · Pointer events only, so mouse and touch share one path.
   · A small movement threshold, so the drag never eats a click.
   · The grab point is anywhere that is not a control, so you can drag a bar
     full of buttons without each one stealing the gesture.
   · Position is stored per key and restored on load; double-click resets it.
   · An element centred with `left:50%; transform:translateX(-50%)` is converted
     to explicit left/top on first drag, otherwise the transform fights the drag.
   · The dock is a div, not a button, precisely so the whole pill is grabbable;
     the click target is an inner button, so drags never get eaten.
   ========================================================================== */
(function () {
	'use strict';

	var PREFIX = 'proto-pos:';
	var THRESHOLD = 4; // px before it counts as a drag rather than a click

	var INTERACTIVE = 'button, a, input, select, textarea, [contenteditable], [role="button"]';

	function load(key) {
		try { return JSON.parse(localStorage.getItem(PREFIX + key) || 'null'); }
		catch (e) { return null; }
	}
	function save(key, pos) {
		try { localStorage.setItem(PREFIX + key, JSON.stringify(pos)); } catch (e) { /* quota */ }
	}
	function clear(key) {
		try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
	}

	function clamp(v, min, max) {
		if (max < min) return min;
		return Math.min(Math.max(v, min), max);
	}

	/**
	 * @param {HTMLElement} node   the bar
	 * @param {string} key         storage key, e.g. 'switcher' or 'feedback'
	 * @param {object} [opts]
	 *   opts.handle  CSS selector for the only grabbable part
	 *   opts.dblclickToReset  default true
	 */
	window.__protoDrag = function (node, key, opts) {
		if (!node || node.__draggable) return;
		// The dock is the single movable thing. If it is on the page, the two
		// bars must not also be draggable — they are placed relative to the
		// dock, so letting them move independently would just put the chrome
		// in two places. Enforced here rather than in each caller, so a
		// consumer cannot reintroduce the problem by attaching for itself.
		if (document.querySelector('.fb-dock') &&
			node.matches && node.matches('.fb-bar, .proto-switch')) return;
		opts = opts || {};
		opts.dblclickToReset = opts.dblclickToReset !== false;
		node.__draggable = true;

		// remember where it started, so reset can put it back
		var home = {
			left: node.style.left,
			top: node.style.top,
			transform: node.style.transform
		};

		/** Switch from transform-centring to explicit coordinates. */
		function toAbsolute() {
			if (node.dataset.dragged === '1') return;
			var r = node.getBoundingClientRect();
			if (!r.width) return; // not laid out yet
			node.style.left = r.left + 'px';
			node.style.top = r.top + 'px';
			node.style.transform = 'none';
			node.style.right = 'auto';
			node.style.bottom = 'auto';
			node.dataset.dragged = '1';
		}

		function place(x, y) {
			var r = node.getBoundingClientRect();
			node.style.left = clamp(x, 4, Math.max(4, window.innerWidth - r.width - 4)) + 'px';
			node.style.top = clamp(y, 4, Math.max(4, window.innerHeight - r.height - 4)) + 'px';
		}

		function restore() {
			node.style.left = home.left;
			node.style.top = home.top;
			node.style.transform = home.transform;
			node.style.right = '';
			node.style.bottom = '';
			delete node.dataset.dragged;
		}

		// re-apply a stored position
		var stored = load(key);
		if (stored && typeof stored.x === 'number') {
			toAbsolute();
			place(stored.x, stored.y);
		}

		// keep it on screen when the window shrinks
		window.addEventListener('resize', function () {
			if (node.dataset.dragged !== '1') return;
			var r = node.getBoundingClientRect();
			place(r.left, r.top);
		});

		if (opts.dblclickToReset) {
			node.addEventListener('dblclick', function (e) {
				if (e.target.closest(INTERACTIVE)) return;
				clear(key);
				restore();
			});
		}

		var startX = 0, startY = 0, offX = 0, offY = 0, active = false, moved = false, pid = null;

		node.addEventListener('pointerdown', function (e) {
			if (e.button != null && e.button !== 0) return;          // left / primary only
			if (opts.handle && !e.target.closest(opts.handle)) return;
			if (!opts.handle && e.target.closest(INTERACTIVE)) return; // don't steal a button
			if (e.target.closest('textarea, input')) return;           // never fight typing

			var r = node.getBoundingClientRect();
			startX = e.clientX;
			startY = e.clientY;
			offX = e.clientX - r.left;
			offY = e.clientY - r.top;
			active = true;
			moved = false;
			pid = e.pointerId;

			node.style.transition = 'none';
			node.style.cursor = 'grabbing';
			if (node.setPointerCapture) { try { node.setPointerCapture(pid); } catch (err) { /* ignore */ } }
		});

		node.addEventListener('pointermove', function (e) {
			if (!active || e.pointerId !== pid) return;
			if (!moved) {
				if (Math.abs(e.clientX - startX) < THRESHOLD && Math.abs(e.clientY - startY) < THRESHOLD) return;
				moved = true;
				toAbsolute();
			}
			e.preventDefault();
			place(e.clientX - offX, e.clientY - offY);
		});

		function end(e) {
			if (!active) return;
			active = false;
			node.style.cursor = '';
			if (pid != null && node.releasePointerCapture) {
				try { node.releasePointerCapture(pid); } catch (err) { /* already gone */ }
			}
			if (!moved) return;
			moved = false;
			node.style.transition = '';
			// suppress the click that ends a drag, so it doesn't open a panel
			node.addEventListener('click', function swallow(ev) {
				ev.stopPropagation();
				ev.preventDefault();
				node.removeEventListener('click', swallow, true);
			}, true);
			if (node.dataset.dragged === '1') {
				var r = node.getBoundingClientRect();
				save(key, { x: Math.round(r.left), y: Math.round(r.top) });
			}
			void e;
		}

		node.addEventListener('pointerup', end);
		node.addEventListener('pointercancel', function () {
			active = false;
			moved = false;
			node.style.transition = '';
			node.style.cursor = '';
		});

		// a hint, once, so the gesture is discoverable
		node.setAttribute('title', (node.getAttribute('title') ? node.getAttribute('title') + '\n' : '') +
			'Drag to move · double-click to reset');
	};

	/**
	 * The chrome people actually want to move. dock.js is now the single
	 * movable thing: it drags, and the panels it opens are placed relative to
	 * it, so moving one moves both. The two bars are only attached when there
	 * is no dock — an older page that has not picked dock.js up still works,
	 * it just has two independently draggable bars.
	 */
	function autoAttach() {
		if (document.querySelector('.fb-dock')) {
			var d = document.querySelector('.fb-dock');
			window.__protoDrag(d, 'dock');
			return;
		}
		[['.proto-switch', 'switcher'], ['.fb-bar', 'feedback']].forEach(function (p) {
			var nodes = document.querySelectorAll(p[0]);
			Array.prototype.forEach.call(nodes, function (n) { window.__protoDrag(n, p[1]); });
		});
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoAttach);
	else autoAttach();

	// the feedback toolbar is built by feedback.js, which may run after us
	document.addEventListener('DOMContentLoaded', function () { setTimeout(autoAttach, 0); });
	window.addEventListener('load', function () { setTimeout(autoAttach, 0); });
})();
