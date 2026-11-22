/**
 * marketing — public isomorphic interface: contract types, pure rules, client api.
 * Other modules import marketing ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export { CONTENT_PAGE_OPTIONS, HOME_PAGE_OPTIONS, marketingPageOptions } from './marketing.pageOptions.rules';
export { pageSeo, pageTitle, SITE } from './marketing.seo.rules';
export {
	CHANGELOG_ENTRIES,
	changelogNewestFirst,
	MARKETING_NAV,
	ROADMAP_SECTIONS
} from './marketing.content.rules';
export { androidRelease } from './marketing.android.rules';
export { featureIcon, FEATURE_ICON_NAMES } from './marketing.icons.rules';
export { createContactApi, type ContactApi } from './marketing.api';
