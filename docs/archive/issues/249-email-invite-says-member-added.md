# 249 — Email invite shows "Member Added!" when only an email was sent

Status: done

Source: repo bug audit 2026-11-01 (lane F).

## Evidence

`MemberInviteTab.svelte:35-39` -> `onSuccess()` -> `members/add/+page.svelte:43-62` 'Member Added!'.

## Repro

Send invite -> 'The new member has been added' but they are not in the family.

## Done

- Red: `members/add/page.svelte.test.ts` "an emailed invite is not an added member (issue 249)" — page showed "Member Added!".
- Fix: `MemberInviteTab` `onSuccess(invitedEmail)`; add page keeps `invitedEmail` and renders its own state: "Invite sent" / "Invite sent to {email} — they join when they open it (expires in 24h)." (24h matches the route's 1-day JWT + `expiresInDays: 1` code). Search/child tabs keep "Member Added!".
- `MemberInviteChildTabs.svelte.test.ts` pins `onSuccess('al@x.com')`. Green.

## Needs doing

(none)
