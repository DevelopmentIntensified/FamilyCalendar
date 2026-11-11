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
