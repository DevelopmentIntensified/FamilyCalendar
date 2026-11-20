/**
 * feedback — public isomorphic interface: contract types and pure rules.
 * Other modules import feedback ONLY through this file, index.server.ts or ui/index.ts (rule R2).
 * Doc: ./README.md#public-interface
 */
export type { BugArea, FeedbackKind, UnmatchedSource } from './feedback.contract';
export { formatBugReportsExport, formatUnmatchedPhrasesExport } from './feedback.export.rules';
export { reportBugHref } from './feedback.rules';
