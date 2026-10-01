/* ============================================================================
   Prototype switcher — scaffolding chrome, NOT part of any design.
   Self-initialising, no imports, so it drops into any page (module or classic).
   Deliberately dark + small so it never reads as product UI in a screenshot.
   Draggable if drag.js loaded first; double-click resets its position.
   ========================================================================== */
(function () {
	'use strict';

	var PAGES = [
		{ href: 'index.html', full: 'Analysis', short: '≡', title: 'Analysis & recommendation' },
		{ href: '0-current.html', full: 'Current', short: '0', title: "Baseline — today's UI" },
		{ href: 'a-warm-studio.html', full: 'A · Warm', short: 'A', title: 'Prototype A — Warm Studio' },
		{ href: 'b-focus-sidebar.html', full: 'B · Rail', short: 'B', title: 'Prototype B — Focus Sidebar' },
		{ href: 'c-day-first.html', full: 'C · Hero', short: 'C', title: 'Prototype C — Day First' },
		{ href: 'd-working-calendar.html', full: 'D · Working', short: 'D', title: 'Prototype D — the synthesis, built from the round-1 review' },
		{ href: 'e-grid-is-the-page.html', full: 'E · Grid', short: 'E', title: 'Prototype E — the grid is the page, built from the round-2 review' }
	];

	// separators: after the read-only pages, and after the rejected variants
	var SEPARATE_AFTER = { 1: 1, 4: 1, 6: 1 };

	function currentFile() {
		var p = location.pathname.split('/').pop();
		return !p || p === '' ? 'index.html' : p;
	}

	function build() {
		var here = currentFile();
		var nav = document.createElement('nav');
		nav.className = 'proto-switch';
		nav.setAttribute('aria-label', 'Switch prototype');

		var label = document.createElement('span');
		label.className = 'proto-switch__label';
		label.textContent = 'View';
		nav.appendChild(label);

		PAGES.forEach(function (p, i) {
			var isCur = p.href === here;
			var a = document.createElement('a');
			a.className = 'proto-switch__btn' + (isCur ? ' is-active' : '');
			a.href = p.href;
			a.title = p.title;
			if (isCur) a.setAttribute('aria-current', 'page');
			a.innerHTML =
				'<span class="proto-switch__short">' + p.short + '</span>' +
				'<span class="proto-switch__full">' + p.full + '</span>';
			nav.appendChild(a);

			if (SEPARATE_AFTER[i]) {
				var sep = document.createElement('span');
				sep.className = 'proto-switch__sep';
				nav.appendChild(sep);
			}
		});

		return nav;
	}

	function mount() {
		if (document.querySelector('.proto-switch')) return;
		var nav = document.body.appendChild(build());
		if (window.__protoDrag) window.__protoDrag(nav, 'switcher');
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
	else mount();

	// keep the active state correct after in-page navigation
	window.addEventListener('popstate', function () {
		var here = currentFile();
		Array.prototype.forEach.call(document.querySelectorAll('.proto-switch__btn'), function (b, i) {
			var on = PAGES[i].href === here;
			b.classList.toggle('is-active', on);
			if (on) b.setAttribute('aria-current', 'page');
			else b.removeAttribute('aria-current');
		});
	});
})();
