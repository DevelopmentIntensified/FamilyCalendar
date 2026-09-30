# 073 — Alerts: group by what needs a decision, not by when

Status: done

Source: `app-ui/notifications.html` review — "passed inspection". Prototype
approved.

**Blocked by:** None (can start immediately).

## Needs doing

- [x] The feed splits into **needs you** and **just news**. Of the five
      notification types, two want a decision (an assignment asked or
      declined); the rest are news.
- [x] Every type gets a human label — asked you, accepted, declined,
      completed, added to family — instead of a bare icon over one pre-rendered
      sentence. A server-side type guard lands with it, since the column is
      free text and the typed union currently exists only in the browser.
- [x] Filter chips: all / needs you / unread, with counts in the section
      titles.
- [x] Unread treatment: dot before the row content, read rows aligned with
      unread ones, unread count in the header.
- [x] Mark-all-read and open-a-notification give feedback (toast, pending
      state). Both are silent today and both swallow their errors.
- [x] Rows are real links, not buttons driven by client-side navigation, so
      open-in-new-tab works and a failed request cannot fake a navigation.
- [x] Unread marking still happens when a notification is opened, and the
      deep link still lands where it did.
- [x] Tests: the grouping function (needs-you vs news, unknown type falls
      back to news), the labels, and the page's rendering of both groups.

## Done

### Shared vocabulary + the guard

`src/lib/utils/notificationTypes.ts` (new) is the one place the five types are
named. It holds the union, the server-side `isNotificationType` guard, the
labels, the tone/glyph tables, the needs-you/news grouping, the filter chips'
counts, and `toNotificationRow` — the boundary function both readers call.

- `+page.server.ts` and `GET /api/notifications` both map their rows through
  `toNotificationRow`. An unrecognised `type` is **kept**, narrowed to
  `type: null`, kept verbatim in `rawType`, grouped as **news**, and rendered
  under the explicit label **"Update"** — never dropped, never echoed raw,
  and never allowed to claim it needs a decision. The page load also
  `console.warn`s the raw value so a bad write is visible server-side.
- The bell and the page now import the same label/tone/glyph tables; the
  component-local `Notification` interface and both `typeIcons` maps are gone.

### Page (`+page.svelte`)

Ported from the prototype: Needs you / Just news sections with counts in the
section titles, filter chips (all / needs you / unread) with counts, unread dot
in a fixed-width slot so read rows stay aligned, header unread count.

- Rows are `<a href>` again. A plain click is intercepted (optimistic read-mark,
  then `goto`); a **modified click falls through to the browser** so
  open-in-new-tab opens and does not race the read-mark.
- Mark-all-read: optimistic clear, `Marking…` pending state, success/failure
  toast, rollback on failure. Open: optimistic dot clear, failure toast, and it
  **still navigates** — a failed read-mark never fakes or blocks a navigation.
- A row with no `link` renders as a `<button>` (mark read only), so it stays
  keyboard-reachable.

### Also

- The nav bell's `markRead`/`markAllRead` no longer swallow errors: they roll
  back and toast. It reads the shared `relativeTime` and the shared labels.

## Notes

### Corrections to this issue as filed

- **"Relative-time formatting is duplicated between the page and the nav
  bell"** — there are **three** copies, not two: `+page.svelte`,
  `NotificationBell.svelte`, and `src/routes/(family)/family/[familyId]/+page.svelte`
  (its activity rows, line 40 pre-change). Extracted to
  `src/lib/utils/dateUtils.ts` → `relativeTime(iso)`. The first two were
  switched over here.
  **Left for the owner of the family detail page** (`src/routes/(family)/**`,
  out of scope for this issue): delete its local `relativeTime` at
  `+page.svelte:40-42`, drop the now-unused `DateTime` import, and
  `import { relativeTime } from '$lib/utils/dateUtils'`. Call site: line 530,
  `relativeTime(item.at)` — compatible with the shared signature
  (`string | null | undefined`), which also fixes the `Invalid DateTime` string
  that an `item.at` of `null` would render there.
- **"the typed union currently exists only in the browser"** — half right. A
  five-member union did exist, but as a **component-local, non-exported
  interface** in `NotificationBell.svelte`, so the page could not use it and
  shipped its own loose `{ [key: string]: string }` icon map. It is now exported
  from `$lib/utils/notificationTypes` and used server-side as a guard.
- **The schema comment omits a type.** `schema.ts:741` documents four
  (`'assignment_pending' | 'assignment_accepted' | 'assignment_declined' |
  'task_completed'`) and is missing `'added_to_family'`, which
  `family/[familyId]/members/add/direct/+server.ts:80` really does write. Left
  alone — `schema.ts` is off-limits here. **Fix the comment.**
- **The page's limit vs the API's limit** — resolved to **50**, now one
  exported constant, `NOTIFICATION_PAGE_SIZE` in
  `src/lib/server/db/actions/notifications.ts`. Three sites disagreed: the
  action's default (20), `GET /api/notifications` (20), and the page load (50).
  Why 50: the page is the surface the bell deep-links into, so truncating the
  destination below the source is what makes "mark all read" and the unread
  filter lie about what is on screen. Accepted cost: the bell polls this GET
  every 60s and now transfers ~2.5× the rows (a few KB gzipped). The clean fix
  is a dedicated count endpoint — not built here.
- **Never pruned / no delete path** (the prototype's side rail) is still true
  and still unbuilt. Out of scope for 073.

### Chip counts vs the header count

Chip counts are derived from the loaded feed and stay put while a filter is
active; the header uses the server's `getUnreadCount`. With one 50-row window
these agree in practice; they can only diverge past 50 unread.
