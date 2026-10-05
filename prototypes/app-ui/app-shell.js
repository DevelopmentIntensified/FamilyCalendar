/* ============================================================================
   Shared app shell for the non-calendar prototypes.
   One chrome, many pages: renders the navbar, the bottom nav, the page header
   and a toast surface, so each page file is content only.

   Deliberately reproduces the app's REAL nav, including the divergence found
   during the audit: the top nav has Groceries and no Notifications, the bottom
   nav has Notifications (as "Alerts") and no Groceries. Both are shown, and
   `?` documents the gap, because that is the honest current state.
   ========================================================================== */

export const APP_NAME = 'Family Planz';

/** Top nav — src/lib/utils/navItems.ts:13-22 (loggedInNavItems) */
export const TOP_NAV = [
	{ href: 'dashboard.html',      label: 'Dashboard', match: 'dashboard.html' },
	{ href: 'tasks.html',          label: 'Tasks',     match: 'tasks.html' },
	{ href: 'groceries.html',      label: 'Groceries', match: 'groceries.html' },
	{ href: 'notifications.html',  label: 'Alerts',    match: 'notifications.html' },
	{ href: 'family.html',         label: 'Family',    match: 'family' }
];

/** Bottom nav — src/lib/components/BottomNav.svelte:20-42.
 *  Groceries is here as "Shop" so six tabs read at a glance; the accessible
 *  name is still Groceries. One destination list feeds both navs, so they
 *  cannot drift.
 *
 *  The tabs share the width evenly and shrink (flex:1 1 0; min-width:0), which
 *  is what the real BottomNav does. A hard min-width per tab is what put the
 *  sixth tab 20px behind the viewport edge at 320px: 6 x 3.5rem = 336px against
 *  312px available, clipped silently by body{overflow-x:hidden}. */
export const BOTTOM_NAV = [
	{ href: 'dashboard.html',     label: 'Calendar',  icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z' },
	{ href: 'dashboard.html',     label: 'Dashboard', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
	{ href: 'tasks.html',         label: 'Tasks',     icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
	{ href: 'groceries.html',     label: 'Shop',      icon: 'M3 3h2l.4 2M7 13h10l3-8H5.4M7 13L5.4 5M7 13l-2.3 5a1 1 0 00.9 1.5H19m-8-5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm6 0a2.5 2.5 0 100-5 2.5 2.5 0 000 5z' },
	{ href: 'notifications.html', label: 'Alerts',    icon: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0', badge: 2 },
	{ href: 'family.html',        label: 'Family',    icon: 'M17 20v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 10a4 4 0 100-8 4 4 0 000 8zM23 20v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' }
];

const SVG = (d, s) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="height:${s};width:${s}">${d.split('M').filter(Boolean).map((p, i) => `<path d="M${p}"/>`).join('')}</svg>`;

function el(tag, cls, html) {
	const n = document.createElement(tag);
	if (cls) n.className = cls;
	if (html != null) n.innerHTML = html;
	return n;
}

function here() {
	const p = location.pathname.split('/').pop();
	return !p ? 'index.html' : p;
}

function isActive(href, match, file) {
	return match === file || (match !== file && file.startsWith(match));
}

/* ──────────────────────────────────────────────────────────────── navbar */
function navbar(file) {
	const nav = el('nav', 'navbar');
	nav.innerHTML = `<div class="wrap navbar__in">
		<a class="logo" href="index.html">
			${SVG('M3 4h18v18H3V4zM16 2v4M8 2v4M3 10h18', '2rem')}
			<span class="logo__text">${APP_NAME}</span>
		</a>
		<nav class="navlinks">
			${TOP_NAV.map((n) => `<a class="navlink${isActive(n.href, n.match, file) ? ' is-active' : ''}" href="${n.href}">${n.label}</a>`).join('')}
		</nav>
		<div class="rowflex gap-2">
			<a class="btn-icon" href="notifications.html" title="Notifications" style="position:relative">
				${SVG('M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0', '1.25rem')}
				<span style="position:absolute;top:.1rem;right:.1rem;min-width:1rem;height:1rem;padding:0 .2rem;border-radius:9999px;background:#b91c1c;color:#fff;font:800 .5625rem/1rem inherit;text-align:center">2</span>
			</a>
			<a class="nav-avatar" href="index.html" title="Data model reference — the route prototypes were built and removed">J</a>
		</div>
	</div>`;
	return nav;
}

/* ─────────────────────────────────────────────────────────── bottom nav */
function bottomNav(file) {
	const bar = el('div', null);
	bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:45;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-top:1px solid var(--s200);display:flex;justify-content:space-around;padding:.5rem .25rem calc(.5rem + env(safe-area-inset-bottom))';
	bar.setAttribute('data-fb', 'bottom-nav');
	bar.setAttribute('data-fb-label', 'Bottom nav');
	bar.innerHTML = BOTTOM_NAV.map((n) => `
		<a href="${n.href}" style="display:grid;place-items:center;gap:.125rem;flex:1 1 0;min-width:0;padding:.25rem .125rem;border-radius:.625rem;text-decoration:none;font:600 .625rem/1 inherit;overflow:hidden;${isActive(n.href, n.match, file) ? 'color:var(--p600)' : 'color:var(--s400)'}">
			${SVG(n.icon, '1.25rem')}
			<span>${n.label}</span>
			${n.badge ? `<span style="position:absolute;top:0;right:.75rem;min-width:.875rem;height:.875rem;border-radius:9999px;background:#b91c1c;color:#fff;font:800 .5rem/.875rem inherit;text-align:center">${n.badge}</span>` : ''}
		</a>`).join('');
	// desktop hides it; the app does the same (BottomNav is md:hidden)
	bar.className = 'hide-lg';
	return bar;
}

/* ────────────────────────────────────────────────────── page furniture */
function pageHead({ file, kicker, title, lede, actions = '' }) {
	const head = el('div', 'rowflex between gap-4');
	head.style.cssText = 'flex-wrap:wrap;margin-bottom:1.25rem';
	head.setAttribute('data-fb', 'page-head');
	head.setAttribute('data-fb-label', 'Page header');
	head.innerHTML = `
		<div style="min-width:0">
			${kicker ? `<span class="pill pill-xs pill-token">${kicker}</span>` : ''}
			<h1 style="margin:.5rem 0 0;font-size:1.75rem;font-weight:800;letter-spacing:-.02em;color:var(--s900)">${title}</h1>
			${lede ? `<p class="hint" style="margin:.25rem 0 0;max-width:38rem">${lede}</p>` : ''}
		</div>
		${actions ? `<div class="rowflex gap-2">${actions}</div>` : ''}`;
	return head;
}

function card(inner, fb, label, style) {
	const n = el('div', 'rail__card', inner);
	if (style) n.style.cssText = style;
	if (fb) { n.setAttribute('data-fb', fb); n.setAttribute('data-fb-label', label || fb); }
	return n;
}

function sectionTitle(text, extra = '') {
	return `<div class="rail__title" style="justify-content:space-between">${text}${extra ? `<span class="rowflex gap-2">${extra}</span>` : ''}</div>`;
}

/* ─────────────────────────────────────────────────────────────── toast */
let toastTimer;
function toast(msg, action) {
	document.querySelectorAll('.toast').forEach((n) => n.remove());
	const t = el('div', 'toast', `<span>${msg}</span>${action ? `<button class="btn" style="background:transparent;color:var(--terracotta);font-size:.8125rem;padding:.25rem .5rem">${action}</button>` : ''}`);
	document.body.appendChild(t);
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => t.remove(), 3200);
}

/* ────────────────────────────────────────────────────────────── mount */
export function mountApp(opts) {
	const file = here();
	document.body.prepend(navbar(file));
	document.body.appendChild(bottomNav(file));
	// room for the bottom nav on mobile
	document.body.style.paddingBottom = '0';

	const main = document.createElement('div');
	main.className = 'wrap';
	main.style.cssText = 'padding-top:1.5rem;padding-bottom:4rem';
	const wrap = el('div');
	wrap.style.cssText = 'display:flex;flex-direction:column;gap:1rem';
	if (opts.head) wrap.appendChild(pageHead({ file, ...opts.head }));
	if (opts.body) wrap.appendChild(opts.body);
	main.appendChild(wrap);
	document.body.appendChild(main);

	return { toast, card, sectionTitle, el, file };
}

export { card, sectionTitle, toast, el, pageHead };
