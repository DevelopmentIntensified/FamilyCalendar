# 027 — PWA share target → smart event create

Status: open

## Needs doing

- Sharing into the installed PWA (mobile OS share sheet) should land on
  the calendar with the smart event create already open and prefilled.
- Implement: `share_target` in the PWA manifest (GET action
  `/calendar?share=1`, params title/text/url — GET avoids service-worker
  POST handling); calendar +page.svelte reads the searchParams on mount,
  opens the create modal, puts the SHARED TEXT INTO THE INPUT itself
  (user-visible, editable — not a hidden prefill), then the normal
  smart-add parse runs on it (title + URL merged; parser handles the
  rest).
- Shared URL should not get chopped by the parser (ties into #025 URL
  fidelity).
- Web-research facts for implementer: on ANDROID the `url` param is
  always empty — shared URLs arrive embedded in `text` (sometimes
  `title`); parser must extract the URL from the text blob itself.
  GET target, params title/text/url; ~2000-byte GET cap (fine). PWA
  must be installed (Chrome/Edge/Samsung Android 76+); iOS/Firefox:
  no share-target receiving at all — degrade to normal paste flow.
  Gmail's built-in "Add to calendar" chip cannot be redirected (no API);
  Messenger and all apps go through the system share sheet.
- Dispatch after #022 lands (both touch EventFormModal).
