<!--
	The PWA share target's landing frame: `/share-target`. The server load has
	already answered 302 `/calendar?quickadd=…`, so this is what a client that
	ignored the redirect (or opened the page offline) sees: the promise that the
	app is opening and a plain way in. Ported from the legacy `+page.svelte`.
-->
<p>Opening FamilyPlanz…</p>
<a href="/calendar">Open FamilyPlanz</a>
