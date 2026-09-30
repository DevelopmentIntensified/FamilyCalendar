/**
 * The one description of every publicly-shared page.
 *
 * The repo had NO og, twitter or canonical tags at all: `src/app.html` was the
 * only head that existed, and 11 of the 13 marketing routes set a title and
 * nothing else. A Family Planz link pasted into a chat was a bare blue URL.
 *
 * Why a table and not per-page props: a shared card is only as good as its
 * description, and a description that lives in a page nobody can see from the
 * hub is one nobody edits. seo.test.ts fails if a route gains a <title> without
 * gaining a row here, and if a title and its row drift apart.
 *
 * Titles and descriptions are written to be the SERP listing, not a slogan:
 * the searcher is looking for a shared family calendar, and that is what the
 * page is.
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

export type SeoEntry = {
	title: string;
	description: string;
	/** routes that should not be indexed: thin, private, or transactional */
	noindex?: boolean;
};

/**
 * Keyed by pathname, without a trailing slash, so it can be looked up straight
 * off `event.url.pathname` and a missing row is an obvious miss rather than a
 * silent one.
 */
export const ROUTES: Record<string, SeoEntry> = {
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
	'/reset': {
		title: 'Reset Password - Family Planz',
		description: 'Choose a new password for your Family Planz account.',
		noindex: true
	},
	'/waitlist': {
		title: 'Join the Waitlist - Family Planz',
		description: 'Get an email when a place opens up.',
		noindex: true
	},
	'/checkout': {
		title: 'Checkout - Family Planz',
		description: 'Finish setting up your plan.',
		noindex: true
	}
};

/** The row for a pathname, or the site defaults. Never throws on a new route. */
export function seoFor(pathname: string): SeoEntry {
	const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
	return (
		ROUTES[clean] ?? {
			title: SITE.defaultTitle,
			description: SITE.defaultDescription
		}
	);
}

/** An absolute URL. og:image and og:url are dropped by every crawler if relative. */
export function absolute(origin: string, path: string): string {
	return `${origin.replace(/\/+$/, '')}${path}`;
}

/** The tags, in the order they have to be right. Returns raw strings so the
 *  layout can render them without a second component. */
export function seoTags(origin: string, pathname: string) {
	const entry = seoFor(pathname);
	const url = absolute(origin, pathname);
	const image = absolute(origin, SITE.image);
	return [
		{ property: 'og:type', content: 'website' },
		{ property: 'og:site_name', content: SITE.name },
		{ property: 'og:title', content: entry.title },
		{ property: 'og:description', content: entry.description },
		{ property: 'og:url', content: url },
		{ property: 'og:image', content: image },
		{ property: 'og:image:secure_url', content: image },
		{ property: 'og:image:type', content: 'image/png' },
		{ property: 'og:image:width', content: String(SITE.imageWidth) },
		{ property: 'og:image:height', content: String(SITE.imageHeight) },
		{ property: 'og:image:alt', content: SITE.imageAlt },
		{ name: 'twitter:card', content: 'summary_large_image' },
		{ name: 'twitter:site', content: SITE.twitterSite },
		{ name: 'twitter:title', content: entry.title },
		{ name: 'twitter:description', content: entry.description },
		{ name: 'twitter:image', content: image },
		{ name: 'twitter:image:alt', content: SITE.imageAlt },
		...(entry.noindex ? [{ name: 'robots', content: 'noindex, follow' }] : [])
	];
}
