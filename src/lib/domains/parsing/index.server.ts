/**
 * parsing — public server interface: the event quick-add services, the
 * `POST /api/parse-event` handler and their types. `compromise` is reachable
 * from here only.
 * Doc: ./README.md#public-interface
 */
export { parseEventQuickAdd, parseEventQuickAddList } from './parsing.event.rules';
export type { EventQuickAddOptions, EventQuickAddResult, ParsedEvent } from './parsing.event.rules';
export { parseEventRequest } from './parsing.service.server';
export type { ParseEventServiceInput } from './parsing.service.server';
export { submitParseEventEndpoint } from './parsing.http.server';
