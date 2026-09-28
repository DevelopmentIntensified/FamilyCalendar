# 073 — Alerts: group by what needs a decision, not by when

Status: open

Source: `app-ui/notifications.html` review — "passed inspection". Prototype
approved.

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The feed splits into **needs you** and **just news**. Of the five
      notification types, two want a decision (an assignment asked or
      declined); the rest are news.
- [ ] Every type gets a human label — asked you, accepted, declined,
      completed, added to family — instead of a bare icon over one pre-rendered
      sentence. A server-side type guard lands with it, since the column is
      free text and the typed union currently exists only in the browser.
- [ ] Filter chips: all / needs you / unread, with counts in the section
      titles.
- [ ] Unread treatment: dot before the row content, read rows aligned with
      unread ones, unread count in the header.
- [ ] Mark-all-read and open-a-notification give feedback (toast, pending
      state). Both are silent today and both swallow their errors.
- [ ] Rows are real links, not buttons driven by client-side navigation, so
      open-in-new-tab works and a failed request cannot fake a navigation.
- [ ] Unread marking still happens when a notification is opened, and the
      deep link still lands where it did.
- [ ] Tests: the grouping function (needs-you vs news, unknown type falls
      back to news), the labels, and the page's rendering of both groups.

## Done

## Notes

- The page's limit and the notifications API's limit disagree (50 vs 20).
  Align them while here.
- Relative-time formatting is duplicated between the page and the nav bell;
  extract rather than add a third copy.
- The bell dropdown and the page must agree on labels — they are the same five
  types seen twice.
