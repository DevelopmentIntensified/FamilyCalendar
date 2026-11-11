# 0006. One boundary builder per request type, zod contracts, wiring-only routes

Status: accepted (2026-11-11)

Every JSON endpoint is defined with kernel `endpoint()`, every page load with `pageLoad()`, and every form action with `formAction()`. Each declares an auth mode and zod schemas for its input. The builders own authentication, parsing, rate limits, the `{ error }` body shape and 500 fault filing. Route files under `src/routes` only import and re-export these definitions (rule R8).

Request and response bodies are zod schemas in `<module>.contract.ts`, shared by the server, the browser api client and the contract tests. zod is a direct dependency (it was already present through better-auth).

## Why

Auth guards existed in four styles across 36+ copies. Input validation was hand-rolled per route: 10+ `isString` copies and 3 copies of the email regex. Malformed JSON gave a 500 on some routes and a 400 on others. The security audit's "no schema validation" finding (#182) asked for exactly this. With the builders, HTTP behaviour can be tested without a server (`invoke`), and the rules can't diverge between routes.

## Consequences

- Malformed JSON now always gets `400 {"error":"Invalid JSON"}`. Some legacy routes answered 500, so this is a documented improvement to [task-api-spec.md](../guides/task-api-spec.md).
- Legacy error messages are kept verbatim when an endpoint is ported. The golden tests pin them.
