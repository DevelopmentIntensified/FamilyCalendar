/**
 * parsing — public server interface: the event quick-add services and their
 * types. `compromise` is reachable from here only.
 * Doc: ./README.md#public-interface
 */
export { parseEventQuickAdd, parseEventQuickAddList } from './parsing.event.rules';
export type { EventQuickAddOptions, EventQuickAddResult, ParsedEvent } from './parsing.event.rules';
