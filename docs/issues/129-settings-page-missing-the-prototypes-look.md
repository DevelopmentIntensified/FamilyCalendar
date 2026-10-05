# 129 — The settings page does not carry the prototype's look

Status: open

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

## Needs doing

- [ ] Rail becomes the prototype's column of cards: 20px radius, 1px border,
      white, 1rem padding, 1rem stack gap, `.rail__title` at .08em
- [ ] Grid to `15rem minmax(0,1fr)` at 1000px, not 1024/16rem
- [ ] Main column: drop the 12px card, follow `.sec`
- [ ] Identity avatar to the prototype's blush `#FED5CF`
- [ ] Inputs and the toast/error banners brought into the same radius language
- [ ] `brand:check` and `proto:check` clean

## Done

(nothing yet)
