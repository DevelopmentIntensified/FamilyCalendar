# 102 — Add a member: explain the child account before the save, not after

Status: done

Source: `app-ui/family-members-add.html` review, prototype approved (no
marks). The prototype's one ask beyond the three-tab layout — which the app
already has — is that the child case explains itself up front.

**Blocked by:** None (can start immediately).

## Needs doing

- [ ] The create-a-child tab says what creating a child actually does, before
      the button is pressed: it makes a real, sign-in-capable account with that
      email address, the address has to be unique across the whole product, and
      no password is set.
- [ ] It says what follows. The parent is the only holder of that address, so
      the child can only ever get in through a magic link to it — which is
      worth saying plainly, because a parent who invents an address will one
      day be surprised that the child can sign in.
- [ ] The unique-address rule is stated as a rule, not as an error the user
      discovers by submitting. Today's only hint is a single line saying each
      child needs their own address, with no reason given.
- [ ] The three-tab shape, the tab order, and every existing affordance stay as
      they are. The app already has find-someone / invite-by-email /
      create-a-child, and that decision is not up for re-litigating.

## Done

- Red first: `MemberInviteChildTabs.svelte.test.ts:104-113` demanded the true
  copy — "no password is set", "magic link" only, "only holder", uniqueness
  "across all of Family Planz" — and asserted the note no longer says
  "rejected on save" (rule framing, not error framing). Failed against the
  pre-102 copy (which also kept the prototype's error-discovery framing).
- Green: `MemberChildTab.svelte:77-92` now states, above the email field and
  before the save button: creating a child makes a real, sign-in-capable
  account with that email; no password is set; signing in works only through a
  magic link to that address; the parent is the only holder of it; the address
  must be unique across all of Family Planz; a placeholder is fine.
- The single grey line under the field stays (existing affordance; the ticket
  fixed the tab shape and meaning, not the layout) and now has its reason in
  the note above it. Three-tab shape, tab order, consent checkbox untouched.
- Suite: `MemberInviteChildTabs.svelte.test.ts` 10/10; touched-surface sweep
  (family components, share, emails, members/add, join, invite lanes, family
  pages, api/family/invite) 18 files / 145 tests green.

## Notes

- **The approved prototype states something false about the app, and copying
  its copy would ship the false part.** It warns that a child row with no
  password hash "can never sign in". That is wrong: the child endpoint creates
  the account through the standard user-creation path, which marks the address
  verified and attaches an email account, so the child **can** sign in — by
  magic link, not by password. Verified against the user-creation helper and
  the child endpoint. Write the true version: no password is set, and the only
  way in is a magic link to an address the parent controls.
- The prototype's other claims check out. A child is a real row in the users
  table, and the email must be unique — the endpoint enforces that in code
  before it creates anything, and says so in its own copy.
- The unique-address check is in the right place (server, before the create),
  so this ticket is copy and placement only. No behaviour change.
- The create flow is not atomic: it creates the account, then attaches the
  membership, with nothing rolling the account back if the second write fails.
  Out of scope here, and a real orphan-account risk — worth its own ticket if
  it bites.
