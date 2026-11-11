# 250 — Add-member tabs show success when the server errors

Status: done

Source: repo bug audit 2026-11-01 (lane F).

## Evidence

`MemberChildTab.svelte:30-34`, `MemberSearchTab.svelte:77-81`, `MemberInviteTab.svelte:35-39` only check `json.error`; SvelteKit 500 body is `{message}`.

## Repro

Server throw -> 'Member Added!'.

## Done

- Red: table-driven tests (500 with `{message}`, 500 with empty body) in `MemberInviteChildTabs.svelte.test.ts` (invite, invite link, child) and `MemberSearchTab.svelte.test.ts` (direct add) — 8 failing.
- Fix: new `src/lib/components/family/responseError.ts` — `json.error`, else `!res.ok` -> `json.message ?? 'Something went wrong. Please try again.'`, else `null`. Used at all four call sites (incl. the invite-link generator, which silently did nothing on a 500).
- Green: `src/lib/components/family/` + `src/routes/(family)/family/` 21 files / 210 tests.

## Needs doing

(none)
