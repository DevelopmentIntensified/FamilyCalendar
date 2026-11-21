# app

**app**, the composition root. This is the only place where real adapters are chosen and all the modules are wired together. Nothing else in `src/lib` imports `app`.

Domain words come from [CONTEXT.md](../../../CONTEXT.md). Architecture rules: [docs/architecture/rules.md](../../../docs/architecture/rules.md).

## Purpose

- **Owns:**
  - the production `Ctx` (`appCtx`);
  - while the rewrite is in progress, the bridges from that Ctx to legacy singletons;
  - later: the session pipeline used by `src/hooks.server.ts`, the cron cleanup that calls each module's retention function, and `/api/health`.
- **Does not own:** business rules. If app code starts deciding things, move that logic into a domain.

## Files

| file | role | what it does, and why it exists | tested by |
|---|---|---|---|
| [appCtx.server.ts](appCtx.server.ts) | composition | Builds the process-wide `Ctx`. Each bridge to legacy code is listed with the ledger task that removes it: the limiter must keep sharing legacy buckets until `access` is ported, and fault filing moves to the `feedback` service. Reads the session secret (`BETTER_AUTH_SECRET`) once through identity's fail-closed `resolveSessionSecret`, with the production flag, so `ctx.config` has what the session service signs with; it reads the email-code pepper (`EMAILSECRET`) the same way through `resolveCodePepper` (Q-117). It also builds the real adapters — `createResendMailer`, `createPushTransport`, `createCerebrasAi` and `createFetchOutboundHttp` — from `RESEND_API_KEY`/`NOREPLYEMAIL`, the VAPID keys, `FCM_SERVICE_ACCOUNT_JSON` and `CEREBRAS_API_KEY`/`CEREBRAS_MODEL`/`CEREBRAS_API_URL`, the only code allowed to read the environment (R6). | `src/hooks.server.test.ts` (legacy suite) runs the hooks that install it |
| [ports.server.ts](ports.server.ts) | composition | `wirePorts(ctx)` is the ONE place a domain's cross-module port is attached to a ctx: a domain declares the port in its `index.server.ts` and the owning module exports the adapter. `AppPorts` is identity's declared `IdentityPorts` — no transition bridge left for it: `CalendarAccessPort` is calendar's REAL `createCalendarAccessPort(ctx)` (one home for the accessible-calendar scope read) and `AdConsentPort` (`getAdConsentRecords`/`recordAdConsentChange`) is sponsored's REAL `sponsoredAdConsentPort(ctx)`, built from the ctx it is attached to so it reads the request's database and clock (a golden's transaction-scoped test db included) — plus family's five, whose `calendar.createFamilyCalendar` is calendar's REAL `createFamilyCalendarPort()` (it writes through the ctx family hands it, so the row joins family's create transaction): `tasks.unassignMemberTasks` (legacy `removeFamilyMember`), `moduleSwitches.listFamilyModuleSwitches` (legacy `getFamilyModuleSwitches`, Q-030), `childAccount.createChildAccount` (legacy `createNewUser` — identity + calendar) and `inviteLink.mintInviteLink` (the legacy HS256 `EMAILSECRET` token + `getUrl()`, read here because app owns the environment). Sponsored declares no `random` port any more: the generation draw is seeded from `sha256(userId + 'YYYY-MM')` (Q-041 B). | exercised through `goldenCtx` and the goldens that read a ported handler's effect (identity's settings goldens for the consent trail, sponsored's for the serve read) |
| [pushTransport.server.ts](pushTransport.server.ts) | bridge | `createPushTransport(config, deps)` is the real `Push`: `web-push` (VAPID details, JSON payload) plus the legacy `fcmService` sender, mapped to the kernel's `sent \| dead \| skipped \| failed`. A Web Push 404/410 and an FCM `unregistered` token both answer `dead`. Config and both transports are parameters (R6; the test injects fakes and never touches the network). | [pushTransport.test.ts](pushTransport.test.ts) |
| [testing/goldenCtx.server.ts](testing/goldenCtx.server.ts) | test harness | `goldenCtx(overrides)` = `testCtx` plus the real adapters, so a frozen `/api` golden sees the rows the other module writes. `clock` and `ids` are production's (`systemClock`, `systemIds`), not `testCtx`'s frozen clock and `id-N` counter: the goldens were written against a legacy handler that read the real clock and minted legacy ids, and they may not change after S2. Pass `now` to pin time in one that needs it. `http` is the real `createFetchOutboundHttp()`, so a golden that stubs the global `fetch` (the location search) scripts the outbound call the port actually makes. This file is the goldens' composition root, so it owns their one environment read: `config.vapidPublicKey`/`vapidPrivateKey` (and `push.webPublicKey`) come from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, as the legacy route read them at request time and the frozen alerts golden sets them (Q-020 gates the answer on both halves); device push stays off because no golden route sends it. S5 service tests keep `testCtx` with memory fakes. | `src/lib/{domains,screens}/*/*.http.db.test.ts` (the goldens) |

## Public interface

- `appCtx`: put on `event.locals.ctx` by [src/hooks.server.ts](../../hooks.server.ts) before any other hook runs. Route files and module code never import it. They receive it through `locals.ctx` and the HTTP builders.

## How to test

- The hooks wiring is exercised by the legacy `src/hooks.server.test.ts` (vitest project `server`). Run it with `npx vitest run --project server src/hooks.server.test.ts`.
- When the session pipeline moves here (task APP-03), it gets `app.*.test.ts` tests.

## Invariants

- `locals.ctx` and `locals.actor` are set on every request, before route code runs. `locals.actor` always mirrors `locals.user`: a bearer token gives `via: 'token'`, a cookie or anonymous account gives `via: 'session'`.
- Hook order stays: security headers, then API origin check, then session. Hooks are composed by hand, not with `sequence()`, so they can be invoked directly in tests (see the comment in `src/hooks.server.ts`).
- `process.env` is read here and nowhere else in `src/lib` (R6): `CRON_SECRET` for cron endpoints, `RESEND_API_KEY` and `NOREPLYEMAIL` for `ctx.mail`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` and `FCM_SERVICE_ACCOUNT_JSON` for `ctx.push`, `CEREBRAS_API_KEY`/`CEREBRAS_MODEL`/`CEREBRAS_API_URL` for `ctx.ai`, and `BETTER_AUTH_SECRET`, `EMAILSECRET` and `NODE_ENV` for the session cookie's signing secret, the email-code pepper and the production flag. The kernel adapters receive those values as parameters, so a kernel or module test never touches the environment.
- The fault path is fail-safe: `ctx.faults.report` calls `feedback`'s `fileAutoBugReport`, which never throws (it skips anonymous callers, throttles itself and catches/logs a failed insert), so a failed auto-report can never change the response. `src/hooks.server.ts`'s `handleError` still files with the legacy builder until APP-03, and the cleanup cron still calls the legacy prunes until APP-01's `runRetention` calls `pruneFeedbackOlderThan`.

## Depends on

- **May import:** anything. Prefer modules' public entries. Legacy imports are allowed here only, as transition bridges.
- **Owns tables:** none.
- **Called by:** `src/hooks.server.ts`.
