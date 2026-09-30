/* ============================================================================
   Brand shell — the chrome every brand-ui page shares.

   Deliberately NOT app-shell.js. That one renders the app's navbar, bottom nav
   and toast, and this set is not the app: a page about an icon that ships with
   the app's own navigation on it is a page arguing with itself. The set needs
   two helpers and a header, and it borrows the design tokens.

   Kept deliberately small — anything that grows here is chrome that the icon
   page does not need and the og page would be wrong to inherit.
   ========================================================================== */

/** A card, using the same class the app-ui pages use, so spacing-check reads
 *  both sets with one set of rules. */
export function card(inner, fb, label) {
	const n = document.createElement('div');
	n.className = 'rail__card';
	if (inner != null) n.innerHTML = inner;
	if (fb) {
		n.setAttribute('data-fb', fb);
		n.setAttribute('data-fb-label', label || fb);
	}
	return n;
}

export function el(tag, cls, html) {
	const n = document.createElement(tag);
	if (cls) n.className = cls;
	if (html != null) n.innerHTML = html;
	return n;
}

/** The set's own header, so no page has to invent one. */
export function head({ title, lede, kicker = 'brand' }) {
	const n = el('div');
	n.setAttribute('data-fb', 'brand-head');
	n.setAttribute('data-fb-label', 'Page header');
	n.innerHTML = `
		<a class="pill pill-xs pill-token" href="index.html" style="text-decoration:none">← ${kicker}</a>
		<h1 style="margin:.75rem 0 0;font-size:2rem;font-weight:800;letter-spacing:-.03em;color:var(--s900)">${title}</h1>
		<p class="hint" style="margin:.5rem 0 0;max-width:46rem;font-size:.9375rem;line-height:1.7">${lede}</p>`;
	return n;
}

/** The page column. */
export function column() {
	const n = el('div');
	n.style.cssText =
		'display:flex;flex-direction:column;gap:1.25rem;max-width:68rem;margin:0 auto;padding:1.5rem 1rem 6rem';
	return n;
}

/** The children of a mark's <svg>, for inlining it at another size. Reused
 *  rather than re-declared so a page can never show a different drawing from
 *  the one the raster was made from. */
export function inner(full) {
	return full.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}
