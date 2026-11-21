/**
 * account — public isomorphic interface: the section list and its hash rule,
 * the wire types, and the banner rule.
 * Other modules import account ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export {
	ACCOUNT_SECTIONS,
	accountSectionHref,
	resolveAccountSection,
	type AccountSectionId
} from './account.sections.rules';
export { accountBanner, type AccountActionForm, type AccountBanner } from './account.form.rules';
export type {
	AccountExportDocument,
	AccountMe,
	AccountPagePaint,
	AccountSectionModel,
	AccountPersonModel
} from './account.contract';
