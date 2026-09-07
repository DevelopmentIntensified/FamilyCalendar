# 027 — PWA share target → smart event create

Status: done

## Done

- Manifest `share_target` repointed to `/calendar` (GET, title/text/url);
  legacy `/share-target` route kept as fallback for already-installed
  PWAs (delete later once install base refreshes).
- Calendar page consumes share params: text (URL deduped into it per
  Android quirk) seeds the NLP input, parse runs immediately, banner
  ack ("Shared text loaded — review and add"), params scrubbed via
  replaceState; pre-existing `?quickadd=` deep link routed through the
  same path; create-modal seed-reset bug fixed en route.
- 8 new tests (`shareTarget.test.ts`); Messenger-style sample parses
  clean (URL whole in description, time extracted) via #025 fidelity.
- Gates: full suite 1267, e2e mobile+events green, check/oxlint/prettier
  0, build ✔ (commit e01bc32).
