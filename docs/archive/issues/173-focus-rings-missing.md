# 173 — Focus rings missing: search, selects, create-name field, CTAs

Status: open

Source: UI audit (issue 135), 2026-10-15. Static class reads; verify focus-visible in-browser per route.

## Done

- Groceries search `focus:outline-none` with NO ring (`groceries:480`); rail selects no ring.
- Family-create name field `focus:ring-0` explicitly OFF (`family/create:162`).
- Account profile/email inputs `primary-500/20` with no white gap; API-token + recurrence selects `outline-none` NO ring.
- Marketing hero CTAs no focus ring (`(marketing)/+page.svelte:60-72`) vs skip-link styled (`theme.css:156-163`).
- Family swatches `focus-visible` primary + name input ring PASS (`family/[familyId]:620,638`); AuthInput rings + OTP `tracking-0.3em` + ModeToggle `focus-visible` PASS; signup/login/forgot need harness verdict.

## Needs doing

- Keyboard-walk every cited control, record visible-focus pass/fail per #135's shape, fix red → green. No fork.
