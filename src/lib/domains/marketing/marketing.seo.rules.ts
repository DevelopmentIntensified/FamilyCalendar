/**
 * The one description of every publicly-shared page.
 *
 * The repo had NO og, twitter or canonical tags at all: `src/app.html` was the
 * only head that existed, and 11 of the 13 marketing routes set a title and
 * nothing else. A Family Planz link pasted into a chat was a bare blue URL.
 *
 * Why a table and not per-page props: a shared card is only as good as its
 * description, and a description that lives in a page nobody can see from the
 * hub is one nobody edits. `marketing.seo.rules.test.ts` fails if a route gains
 * a <title> without gaining a row here, and if a title and its row drift apart.
 *
 * Titles and descriptions are written to be the SERP listing, not a slogan:
 * the searcher is looking for a shared family calendar, and that is what the
 * page is.
 *
 * The origin is a parameter, never a hardcoded domain: there are three
 * environments (prod, test, a preview URL) and a canonical that points at the
 * wrong one is worse than no canonical.
 *
 * Doc: ./README.md#invariants
 */

export const SITE = {
	name: 'Family Planz',
	/** the fallback, used when a route has no row of its own */
	defaultTitle: 'Family Planz — the shared family calendar',
	defaultDescription:
		'One shared calendar for the whole family: events, RSVPs, tasks and the grocery list, in one warm place.',
	/** relative to the origin the request arrived on */
	image: '/brand/og.png',
	imageWidth: 1200,
	imageHeight: 630,
	/**
	 * The image is the h2 headline off prototypes/brand-ui/og.html. It is a
	 * description of the picture, not a repeat of the page title — crawlers and
	 * screen readers use it when the image itself does not load, and it is the
	 * only alt text the card ever has.
	 */
	imageAlt: "Everyone's week, on one page.",
	twitterSite: '@familyplanz'
} as const;

export type SeoRow = {
	readonly title: string;
	readonly description: string;
	/** routes that should not be indexed: thin, private, or transactional */
	readonly noindex?: boolean;
};

/**
 * Keyed by pathname, without a trailing slash, so it can be looked up straight
 * off `event.url.pathname` and a missing row is an obvious miss rather than a
 * silent one.
 */
export const MARKETING_PAGES: Readonly<Record<string, SeoRow>> = {
	'/': {
		title: 'Family Planz — the shared family calendar',
		description:
			'Soccer practice, parent-teacher conferences, date night — keep every family member’s schedule, tasks and grocery list in one warm, welcoming place.'
	},
	'/features': {
		title: 'Features - Family Planz',
		description:
			'Events with RSVPs, a family task board with assignment and handoff, recurring jobs that roll forward on their own, groceries by store, and ICS import.'
	},
	'/pricing': {
		title: 'Pricing - Family Planz',
		description:
			'Start free and keep the whole family on one calendar. See what is included at every plan, and what a year costs.'
	},
	'/about': {
		title: 'Family Planz: About',
		description:
			'Who we are and why we built a shared family calendar that does not need an account to try.'
	},
	'/changelog': {
		title: 'Changelog - Family Planz',
		// Deliberately does NOT name features. The old description here listed
		// "receipt scanning", which is issue 087: the money subsystem was archived
		// before it ever shipped, and a changelog description is the one string
		// guaranteed to be read by a crawler.
		description: 'What shipped in Family Planz, and when — every release, in order.'
	},
	'/roadmap': {
		title: 'Roadmap - Family Planz',
		description: 'Where Family Planz is headed next, and what we are deliberately not building yet.'
	},
	'/android': {
		title: 'Android App - Family Planz',
		description:
			'Install Family Planz on Android: add our F-Droid repository for automatic updates, or download the APK.'
	},
	'/contact': {
		title: 'Contact Us - Family Planz',
		description: 'Questions, bug reports, or an idea for the family calendar — get in touch.'
	},
	'/privacy': {
		title: 'Privacy Policy - Family Planz',
		description: 'What Family Planz stores, who it is shared with, and how to have it deleted.'
	},
	'/login': {
		title: 'Log In - Family Planz',
		description: 'Log in to your family calendar.',
		noindex: true
	},
	'/signup': {
		title: 'Sign Up - Family Planz',
		description: 'Create your family calendar. No card, no account needed to look around first.',
		noindex: true
	},
	'/forgot-password': {
		title: 'Forgot Password - Family Planz',
		description: 'Reset the password on your Family Planz account.',
		noindex: true
	},
	'/forgot-password/reset': {
		// The page's own `<title>`: `/reset` named no route, so this page used to
		// fall back to the site title and stay indexable (sheet note, #095).
		title: 'Family Planz: Set New Password',
		description: 'Choose a new password for your Family Planz account.',
		noindex: true
	},
	'/checkout': {
		title: 'Checkout - Family Planz',
		description: 'Finish setting up your plan.',
		noindex: true
	}
};

/** One share tag: Open Graph tags carry a `property`, the rest a `name`. */
export type SeoMetaTag =
	| { readonly property: string; readonly content: string }
	| { readonly name: string; readonly content: string };

/** What the layout emits for one page: description, canonical link and the share tags. */
export type PageSeo = {
	readonly title: string;
	readonly description: string;
	readonly canonical: string;
	readonly meta: readonly SeoMetaTag[];
};

/** The row for a pathname (a trailing slash is ignored), or the site defaults. Never throws on a new route. */
function seoFor(pathname: string): SeoRow {
	const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
	return (
		MARKETING_PAGES[clean] ?? {
			title: SITE.defaultTitle,
			description: SITE.defaultDescription
		}
	);
}

/**
 * The `<title>` of `pathname` — the row's own string, so a page cannot advertise
 * one title and render another (Q-069: the home page used to disagree with its
 * row, and the old test walked child directories so the root was never read).
 */
export function pageTitle(pathname: string): string {
	return seoFor(pathname).title;
}

/** An absolute URL on the given origin; og:image and og:url are dropped by every crawler if relative. */
function canonicalUrl(origin: string, path: string): string {
	return `${origin.replace(/\/+$/, '')}${path}`;
}

/**
 * Everything the layout needs to describe `pathname` on `origin`: the row (or
 * the site defaults), the self-referencing canonical (the path exactly as
 * requested), and the tags in the order they have to be right — `robots:
 * noindex, follow` last, for the transactional paths only.
 */
export function pageSeo(origin: string, pathname: string): PageSeo {
	const row = seoFor(pathname);
	const canonical = canonicalUrl(origin, pathname);
	const image = canonicalUrl(origin, SITE.image);
	return {
		title: row.title,
		description: row.description,
		canonical,
		meta: [
			{ property: 'og:type', content: 'website' },
			{ property: 'og:site_name', content: SITE.name },
			{ property: 'og:title', content: row.title },
			{ property: 'og:description', content: row.description },
			{ property: 'og:url', content: canonical },
			{ property: 'og:image', content: image },
			{ property: 'og:image:secure_url', content: image },
			{ property: 'og:image:type', content: 'image/png' },
			{ property: 'og:image:width', content: String(SITE.imageWidth) },
			{ property: 'og:image:height', content: String(SITE.imageHeight) },
			{ property: 'og:image:alt', content: SITE.imageAlt },
			{ name: 'twitter:card', content: 'summary_large_image' },
			{ name: 'twitter:site', content: SITE.twitterSite },
			{ name: 'twitter:title', content: row.title },
			{ name: 'twitter:description', content: row.description },
			{ name: 'twitter:image', content: image },
			{ name: 'twitter:image:alt', content: SITE.imageAlt },
			...(row.noindex ? [{ name: 'robots', content: 'noindex, follow' }] : [])
		]
	};
}
