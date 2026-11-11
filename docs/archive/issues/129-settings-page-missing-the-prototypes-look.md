# 129 — The settings page does not carry the prototype's look

Status: in-progress

`/calendar/settings` is a shim: `+page.server.ts` only, `redirect(302, '/account#calendar')`.
Correct — no page belongs there, nothing links to it, and the `#calendar` anchor
resolves through `resolveAccountSection`. **Not a defect.**

**`/account` IS the settings surface.** Nine sections, `accountSections.ts:12-22`.
That lane shipped in `2ce04ac`, which fixed missing *content*. It did not fix the
*look*: the account lane compared what each section says and never compared the
card chrome the prototype draws them in.

## Measured, file:line

| | prototype | app now |
|---|---|---|
| grid | `15rem minmax(0,1fr)` @ **1000px** — `account.html:19` | `lg:flex-row` @ **1024px**, rail `lg:w-64` = **16rem** — `+page.svelte:33`, `AccountSidebar.svelte:51` |
| rail | `.rail__card`: white, 1px `--s200`, **1.25rem radius**, 1rem padding — `proto.css:317` | `nav` with `border-b border-slate-200 p-4` — a bordered box, `AccountSidebar.svelte:52` |
| rail stack | `.rail` = flex column, **1rem gap** — `proto.css:316` | no gap declared; rows are `rounded-lg` = **8px** — `AccountSidebar.svelte:61,83` |
| section title | 11px/700/uppercase/**.08em**/`--s400`, `mb .75rem` — `proto.css:318-321` | `tracking-widest` = **.1em** — `AccountSidebar.svelte:53` |
| main | `.sec` unframed, `scroll-margin-top: 5.5rem` — `account.html:25-26` | `rounded-xl border bg-white shadow-sm` = **12px** card, `p-6` = 24px |
| identity avatar | 2.5rem circle, `#FED5CF` blush — `account.html:79` | `h-10 w-10` = **2.5rem**, `bg-orange-100 text-orange-700` — `AccountSidebar.svelte:104` |
| inputs / banners | the 20px card language | `rounded-lg` = 8px — `AccountEmailSection.svelte`, `+page.svelte` toasts |

This is the same 20px card language the six family pages just landed in `16eff6d`.
The account page was not in that lane.

## Why it was missed

Both earlier rounds compared **feature presence** and **section content**. The
family lane's own finding was that "every previous round compared feature
PRESENCE, never geometry". The account round then compared section *prose* and
missed the same thing one level in.

## Rules for whoever builds it

- The approved prototype is the spec, look AND function. Never "the app is
  already better".
- Do not remove loading/empty/error states or authz to match the picture — the
  prototype cannot show them. Nine sections stay nine; the `#hash` deep links
  stay; `resolveAccountSection` stays.
- Measure in a browser against the prototype at 1000px, 1440px and a phone
  width. Report real numbers, not Tailwind arithmetic.
- The Notifications card is a separate in-flight change on this same folder. Do
  not start until that fence is clear, or the two collide on
  `AccountSidebar.svelte` and the section components.

## Done 2026-10-22 (first slice, measured)

- Rail: `nav[data-testid=account-rail-card]` is a rail__card — rounded-[1.25rem],
  1px slate-200 border, white, p-4; rows at the `.snav` .625rem radius, uniform
  slate-600 (red dropped — the marketing palette carries no red at rest, and the
  prototype's snav rows are uniform); title 11px/700/uppercase/**.08em**
  (`AccountSidebar.svelte:54-105`).
- Grid: `min-[1000px]:grid-cols-[15rem_minmax(0,1fr)] items-start`, gap 1rem,
  sticky rail top 5.25rem (`+page.svelte:60-64`).
- Main: the 12px wrapper card is gone; header is a divider, the mounted section
  rides in a 20px rail__card, banners rounded-xl (`+page.svelte:38-100`).
- Avatar: blush `#FED5CF` + `#c45e38`, 700 weight (131's token run flagged the
  800; marketing governs type); identity card framed, white/95
  (`AccountSidebar.svelte:108-127`).
- Inputs: rounded-lg → rounded-xl (prototype `.input` is .75rem) in Email,
  Profile, Danger, ApiTokens sections. **CalendarSection left fenced** — it is
  inside the in-flight Notifications/consent slice's edits.
- Navbar signed-in pill bg-slate-100 → bg-slate-50 — the last colour-token
  deviation in the /account measurement (131's #f1f5f9 row).
- Conformance: `e2e/conformance/account-known-bad.test.ts` converted to the
  shipped ruling — **zero deviations on every colour/type/shadow property the
  harness tracks at 1000px**, and the prototype's geometry measured in a real
  browser: rail card 20px radius / 16px padding, 16px stack gap, .08em tracking
  (0.88px computed), 240px grid rail track. 2/2 conformance tests green
  (marketing leave-one-out + /account).
- `brand:check` clean. `proto:check` has ONE pre-existing red, untouched by this
  slice: `app-check.mjs §7` says `sessions` is modelled but not in schema.ts
  (the #196 better-auth cutover renamed it `authSession…` — the prototype check
  needs that slice to update the model list).
- `e2e/testUtils.ts` rebased onto the committed better-auth session API
  (`createSession`/`createSessionCookie` on `authSession`); the auth cutover
  commit had left it calling the removed `lucia`. Dev DB got `auth_session`
  hand-created (sql recorded: Temp work dir; idempotent CREATE TABLE IF NOT
  EXISTS) because migration 016 (consent) fails first in the boot chain and
  blocks 018 — **that is the #088/#196 slices' operational debt, not this
  ticket's**.

## Needs doing (remainder of the drift table)

- [ ] Prototype measure at 1440px and a phone width, not just the harness's
      1000px
- [ ] Avatar stays 700, not the prototype's 800 (marketing governs type) —
      owner call if 800 should win
- [ ] Identity card white/95 vs the prototype's white/80 (white/80 is not a
      marketing palette value; owner call)
- [ ] Main rail__card keeps p-6 (24px) where the prototype uses 1rem — owner
      call; sections were composed for the extra room
- [ ] Upper-case `.rail__title` colour stays slate-400 = --s400 ✓; rows keep
      text-sm (14px) where the prototype is 13px (marketing governs type, 13px
      is not in the corpus)
