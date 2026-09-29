# 077 — Family settings: the page reads as one page

Status: in-progress

Source: `app-ui/family-detail.html` review, dashboard module switches marked
**rebuild** — "compact this and make the whole page look more put together and
less things touching and with too little space, but too spread out".

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The page's existing e2e spec still passes; the settings/toggle flows are
      untouched in behaviour. (`e2e/family/*` is DB-backed — could not run
      locally, no Postgres/Docker on this box. Selectors audited by hand: the
      spec's `input[name=name]`, `input[name=color]`,
      `button:has-text("Save Changes")`, `h2:has-text("Members")` and
      `button:has-text("Remove")` all survive; no module row text collides
      with any of them. CI/`test` deploy is the real guard.)
- [ ] Confirm no horizontal overflow at 320px on a real render. Arithmetically
      the compact row cannot overflow (264px of row width, ~172px of chips and
      gaps, label `truncate`s) and every edit was subtractive — but
      `e2e/family/MobileLayout.test.ts` is the actual proof and it did not run.
- [ ] Density pass on the loose bands (hero card, invitations links, the
      member row's control cluster) — see "Landed / not landed" below.
- [ ] Non-admin view: the page's `sm:col-span-*` and band rhythm were only
      reasoned about for the admin layout; a plain member sees one column.

## Done

- [x] The dashboard module switches become compact: each module is one row
      with its label, its scope (personal or family-wide) and its state, not a
      tall block of stacked text. → `DashboardModuleRow.svelte`, one row per
      module: `label` + scope chip + state chip, whole row is the submit
      button. Row height 48px → 40px, list gap 8 → 6px.
- [x] The page's bands get a consistent rhythm — one gap between bands
      (`gap-5`, was 16px ad hoc), one internal padding (`p-4`, `BAND`), one
      label treatment (`BAND_TITLE`: `text-xs uppercase tracking-wide
text-slate-500`, was `text-lg font-semibold` on some bands and
      `text-sm font-semibold` on another).
- [x] Density goes up and air comes back: module rows 48 → 40px, member rows
      58 → 50px (avatar `h-10` → `h-9`, `py-2` → `py-1.5`), activity rows
      38 → 35px, list gaps 8 → 6px; band gap 16 → 20px so nothing touches.
- [x] A module toggle still flips in under 100ms and confirms what changed. →
      optimistic flip in the click tick (`onAcknowledge`), `aria-busy` while
      in flight, revert-on-failure, and a toast naming the new state
      ("Family Task Board is now off for everyone."). Previously: bare
      `use:enhance` with no ack, no toast, no revert.
- [x] No horizontal scroll introduced to save vertical space.

## Notes

- 793 lines, the largest page in the app. The reviewer's complaint is
  composition, not structure — resist splitting the file here; that is a
  different job with its own risk.
- The module list is the same data the dashboard consumes; if the compact
  rendering needs a shared row component, extract it once and use it in both.

### Landed

- `src/lib/utils/moduleRowState.ts` — the three real states, read off the
  model rather than guessed: `on`, `off` (family master switch), and
  `hidden-for-me` (master on, viewer hid it in their own settings). Family-off
  outranks hidden-for-me so a row never says two things at once. Also owns
  `moduleToggleValue(enabled)` — the one function that says what a flip _means_.
  The page load now returns the viewer's `hiddenDashboardModules` so the third
  state is real, not theoretical.
- `src/lib/components/dashboard/DashboardModuleRow.svelte` — dumb by
  construction: it renders `state` and reports that it was activated
  (`onAcknowledge`); the owner decides what the row looks like and what to
  post. Holds no state of its own. `onSubmit` is the same _factory_ shape the
  rest of the page passes to `use:enhance` (SvelteKit calls the factory with
  the submit args and uses the returned function as the result callback).
- Tests: 10 table-driven on the state model, 11 on the component (three
  states, scope label, payload, ack-without-self-flip, optimistic-then-revert,
  pending, truncate-not-widen).

### Landed / not landed

- **The row is used in one place, not two.** `AccountCalendarSection.svelte`
  renders the same module list as checkboxes inside one big
  "Save Calendar Settings" form. Swapping it for the row would change that
  form's save semantics — a behaviour change 077 explicitly rules out — and
  that page is another lane. The row is shaped so it can be adopted there
  later (`state` in, `optimistic`/`onSubmit` optional), but it is not
  adopted yet.
- **The `meals` entry and the module list are untouched**, per #080/#081.
  `dashboardModules.ts` was read only.

### For #080

`DashboardModuleRow` is dumb about meaning. Changing what a module switch
_means_ touches exactly two places, not the markup:

1. `moduleRowState()` in `src/lib/utils/moduleRowState.ts` — how (scope,
   enabled, hiddenForViewer) collapse to a state.
2. `moduleToggleValue(enabled)` in the same file — what the submit posts.

The component's own `state` union would only need widening if a genuinely new
state is introduced; the `ModuleRowState` type is the seam. The component
test asserts the row never flips itself, so a dumb-row regression fails there
rather than on the page.
