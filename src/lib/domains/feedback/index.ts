/**
 * feedback — public isomorphic interface: contract types, pure rules, the
 * browser api client and the two admin register state classes.
 * Other modules import feedback ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export type {
	BugArea,
	FeedbackBugRegister,
	FeedbackKind,
	FeedbackPhraseRegister,
	UnmatchedSource
} from './feedback.contract';
export type { FeedbackApi, FeedbackResolveResult } from './feedback.api';
export { createFeedbackApi } from './feedback.api';
export { formatBugReportsExport, formatUnmatchedPhrasesExport } from './feedback.export.rules';
export {
	FeedbackBugRegisterState,
	FeedbackPhraseRegisterState
} from './feedback.register.state.svelte.js';
export type { FeedbackFormEnhancer } from './feedback.report.state.svelte';
export { ReportBugState } from './feedback.report.state.svelte.js';
// Issue 257's link lives in kernel so the chrome can render it without this
// entry's exporters (and their date library); kept here for the module's
// documented surface.
export { reportBugHref } from '$lib/kernel/ui/bugReportLink';
