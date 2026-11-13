# Playbook: add a port to ctx (mail, push, AI, outbound HTTP, …)

A **port** is a side-effect dependency that services reach through `ctx`, so tests can replace it. Add one only when the module you are porting needs it ("one adapter is a guess, two is a seam"). Expected ports, in the order modules will need them:

| port | first needed by | real adapter wraps | memory adapter records |
|---|---|---|---|
| `mail` | access (magic links, codes), family (invites), marketing (waitlist) | Resend (legacy `utils/sendEmail.ts`) | `outbox: MailMessage[]` |
| `push` | alerts (web push + FCM device fan-out) | `web-push`, legacy `fcmService` | `sent: PushMessage[]` |
| `ai` | parsing (`/api/parse-event`), calendar bulk smart edits | legacy `services/llm.ts` (Cerebras JSON chat) | scripted replies, `calls[]` |
| `http` | verse (Crossway), calendar (Nominatim location search) | global `fetch` with a timeout | scripted responses by URL |
| `blob` | sponsored (ad assets) | `@vercel/blob` (see carry-over #180 before wiring) | in-memory map |

## Steps (example: mail)

1. **Port type and memory adapter**, isomorphic: `src/lib/kernel/mail/mailer.ts`

   ```ts
   export type MailMessage = { readonly to: string; readonly subject: string; readonly html: string; readonly text?: string };
   export type Mailer = { send(message: MailMessage): Promise<void> };
   export type MemoryMailer = Mailer & { readonly outbox: MailMessage[] };
   export function createMemoryMailer(): MemoryMailer {
   	const outbox: MailMessage[] = [];
   	return { outbox, send: async (message) => void outbox.push(message) };
   }
   ```

2. **Real adapter**, server-only: `src/lib/kernel/mail/resendMailer.server.ts`. It takes its config as parameters (`createResendMailer({ apiKey, from }, fetcher = fetch)`), so its test injects `fetcher` and never touches the network. It never reads `process.env` (rule R6).
3. **Ctx:** add `readonly mail: Mailer` to `Ctx` in [ctx.server.ts](../../../src/lib/kernel/ctx/ctx.server.ts). If config is needed, add the fields to `AppConfig` too.
4. **Test ctx:** in [testCtx.server.ts](../../../src/lib/kernel/testing/testCtx.server.ts), add `mail: createMemoryMailer()` and widen `TestCtx` to `MemoryMailer`, so tests can read `ctx.mail.outbox`.
5. **Production:** in [appCtx.server.ts](../../../src/lib/app/appCtx.server.ts), read the env vars (the only place allowed to) and build the real adapter. While legacy callers still send mail directly, both paths coexist. That's fine.
6. **Tests:**
   - `mailer.test.ts` covers the memory adapter's behaviour.
   - `resendMailer.test.ts` uses a fake `fetcher` to assert the request it builds (URL, headers, body) and how it handles a non-2xx response.
7. **Docs:** add both files to the kernel README Files table, and add the port to "Ctx and actor". Mention the new config field in the app README.

**Check:** `npm run test:mod -- kernel && npm run arch && npm run docs:check && npm run typecheck`. Commit `rewrite(kernel): add mail port`, as part of the module task that needed it.

## Domain ports

The table above is for dependencies kernel owns. A port between **domains** is different: the module that *needs* the work declares it, in its own `index.server.ts`, because it may not import the owning module (R1):

```ts
// src/lib/domains/identity/index.server.ts
export type CalendarAccessPort = { ... };
export type AdConsentPort = { ... };
export type IdentityPorts = {
	readonly calendarAccess: CalendarAccessPort;
	readonly adConsent: AdConsentPort;
};
export type IdentityCtx = Ctx & IdentityPorts;
```

- **Declared by the needing module:** `<M>Ports` and `<M>Ctx = Ctx & <M>Ports`; its services take `<M>Ctx`. family plans `FamilyCalendarPort` / `MemberTasksPort`, identity plans `CalendarAccessPort` / `AdConsentPort`.
- **Adapter exported by the owning module:** the higher-ranked domain implements the type over its own services and exports the factory from its `index.server.ts`.
- **Wired once:** [src/lib/app/ports.server.ts](../../../src/lib/app/ports.server.ts) — its `wirePorts(ctx)` returns the ctx plus `AppPorts`, and an owning module's S5 adds its adapter there. Nothing else chooses it.
- **S5 service tests** keep `testCtx` and pass a memory fake for each port they exercise (`{ ...testCtx({ db }), calendarAccess: memoryCalendarAccess() }`), asserting on what the fake recorded.
- **`/api` goldens** call `goldenCtx` ([goldenCtx.server.ts](../../../src/lib/app/testing/goldenCtx.server.ts)), which is `testCtx` plus every real adapter, so a frozen golden sees the rows the other module actually wrote.
