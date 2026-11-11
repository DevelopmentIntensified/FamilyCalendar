# 056 — Navbar Calendar button dead for dashboard-default users

Status: done

## Done

- Root cause: `/calendar` server load redirects `defaultView === 'dashboard'`
  users to `/calendar/dashboard` — including explicit taps on the Calendar
  nav button. Already on dashboard → tap appears to do nothing.

## Needs doing

- Nav Calendar hrefs bypass the landing redirect via the existing
  `?dashboardView=1` escape hatch (desktop `loggedInNavItems` + `BottomNav`).
- Active-highlight matchers compare pathname-only so highlight still works.
- Unit tests updated; targeted vitest green.
