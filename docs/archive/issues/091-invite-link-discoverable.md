# 091 — The family invite link is only findable by knowing where to look

Status: done

Source: instruction — technical-debt sweep of dead features and half-wired code.

**Blocked by:** None (can start immediately).

## The problem

Everything the invite flow needs exists and works. A creator or admin can mint a
code, copy the link, revoke it, and email a join link. A stranger can open
`/family/join/<code>`, see which family it is, log in or sign up, and join — with
the member cap enforced. The join page is public. The machinery is sound.

Nobody can find any of it:

- **No share sheet and no native share.** Copy-to-clipboard is the only
  affordance, in four places, all bespoke. Nothing uses the platform share
  sheet, so inviting from a phone means copying a URL and pasting it into
  whatever the user was going to use anyway.
- **No "invite by link" on the family page.** The family page offers *Add
  member* and *Manage invitations*; getting a link takes two clicks and lands on
  a page about managing codes, not about sending one.
- **No email template contains the code link.** The one family-invite email is
  an inline HTML string built inside a route handler, and it carries a
  single-recipient token link — not the code-based link the rest of the flow
  uses. There is no template registry to hang a proper one on.
- **A non-admin has no page at all.** A plain Family Member visiting the
  invitations URL gets an empty list and a message saying only the creator or an
  admin can manage invitations. A member who was sent a link has nowhere to look
  it up.

Three smaller things on the same path:

- The join page renders the raw server error string in a red box when the code
  is bad, and an invalid code redirects to the family page with a query
  parameter nothing reads — so the stranger who followed a stale link gets no
  explanation at all.
- The code's use is consumed whether or not the person actually joins, so the
  use count on the code overstates how many people joined it.
- The two defaults disagree: minting a code through the action defaults to a
  single use; minting it through the route defaults to ten.

## Needs doing

- [ ] One share surface for an invite link: a share sheet that uses the
      platform share where it exists and falls back to copy where it does not,
      with a real toast. Replace the four bespoke copy handlers with it. The
      clipboard pattern already works in production — keep its failure copy.
- [ ] An "Invite by link" affordance on the family page for anyone who may mint
      a code, landing on a single link the user can share immediately rather than
      on a management page.
- [ ] A real email template containing the code link, built through the
      dependency-injection pattern the magic-link service already uses, so it
      can be tested without sending. Retire the inline HTML string in the route
      handler.
- [ ] Decide what a plain Family Member sees. Either they can get a link, or the
      page says so plainly instead of showing an empty list.
- [ ] Replace the raw error box on the join page with a real message, and make
      the invalid-code redirect explain itself.
- [ ] Reconcile the use-count semantics with what the code claims, and unify the
      two defaults.
- [ ] Tests: share falls back correctly where the platform share is absent; the
      minted code appears in the email body; a bad code tells the user
      something useful.

## Done

*(This ticket was finished across several slices; the last two landed now.)*

- **Share surface**: one ladder, `$lib/client/share.ts` (`copyOrShare` —
  platform share sheet, async clipboard, selection copy, honest `failed`),
  tested in `share.test.ts` including the fallback where `navigator.share` is
  absent and where the clipboard is denied. All four bespoke handlers now call
  it: family page (minted link + live code), invitations page, and
  `MemberInviteTab` (final one, red-first this slice:
  `MemberInviteChildTabs.svelte.test.ts` asserts share-sheet use, copy
  fallback, and the kept manual-copy failure copy). The tab acks "Shared ✓"
  when the sheet carried the send.
- **"Invite by link" on the family page**: landed with the families-list lane —
  `family/inviteLink.svelte.test.ts` + `family/page.server.test.ts` gate it by
  the same creator/admin rule as the mint route; it lands on the link itself
  and walks the ladder.
- **Email template**: this slice. `src/lib/server/emails/family-invite.ts`
  (`getFamilyInviteEmailHtml`) holds the copy — inviter name, join link as a
  real anchor, 24-hour expiry, ignore-if-unexpected line — exported through
  the route's `InviteEmailSendDeps.renderEmail` (the magic-link service's DI
  pattern), and the inline HTML string is gone from
  `members/add/email/+server.ts`. Tests: the template itself asserts all four
  copy rules without sending (`family-invite.test.ts`), and the route test
  proves the send call's body is exactly what the injected render produced,
  with the minted code-bound link inside it (issue 152's durable invite row:
  the code rides in the signed token the link carries).
- **Plain Family Member**: decided on the families-list lane — members see
  their existing invitations ("View family invitations"), only
  creator/admin see the mint affordance (`family/inviteLink.svelte.test.ts`).
- **Join page**: invalid codes are answered on the page (no redirect; the
  loader returns `invalid` — `join/[code]/page.server.test.ts`), with copy
  naming the three reasons and next steps; API errors render in an
  "explained" alert block with a fresh-link hint (`+page.svelte:108-115`).
- **Use-count semantics + unified default**: accepting (not consuming on
  opened) increments `useCount` under the same transaction lock as the
  maxUses check (`families.ts:243`), and every mint path uses
  `DEFAULT_INVITE_MAX_USES` (`api/family/invite/server.test.ts` pins it).
- Build-on-this-slice gates: touched-surface sweep 18 files / 145 tests green;
  `svelte-check` error count unchanged for every file touched here (tree-wide
  count moves with a concurrent agent's unrelated edits).

## Notes

- The premise that the family settings page links to a help page that 404s is
  **stale** — that was the family detail page pointing at a literal-brace URL,
  fixed by 064. It now points at the real invitations page. The rest of this
  issue stands on its own.
- The family detail page's links are guarded by an existing test that asserts
  every static href resolves to a route the router actually serves. A new
  documentation link would fail that suite by design.
- Route handlers under the family invite API have **no tests at all**, and there
  is no end-to-end coverage of the join flow. That is the seam to build first.
