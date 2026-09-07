# 010 — Bill receipts

Parent: #003 Bill Tracking PRD (story 8).

Status: in-progress

## DECISION CHANGE (user, 2026-09-07): NO receipt image storage

Receipt images are PROCESSED AND DELETED — never uploaded, never stored.
All storage-side work from the in-flight lane (attachments table,
/api/receipts upload, blob prefix, bills.attachmentId) will be removed
by the follow-up slice; the scan seam stays.

## Surviving design

- Local OCR chain (browser-side): Chrome Prompt API → native bridge
  (future) → tesseract.js → opt-in Azure fallback. Images NEVER leave
  the device except the explicit Azure opt-in (image sent to Azure,
  Azure auto-deletes in 24h, not stored by us).
- Extraction → prefilled bill form for review (never auto-save):
  merchant/title, total, date, category suggestion.
- **Line items saved as TEXT ONLY** (#031): receiptItems (billId, label,
  priceCents, category, position) — the image is gone; the parsed
  numbers/text are what persists.
- Per-item category labeling + learning tag system = #031.
- EXIF/GPS concern: MOOT — image never leaves the device or persists.

## Privacy wins (from #029 audit)

- H1 (public receipt blobs) → eliminated by design.
- H2 (blob orphaning on account deletion) → eliminated by design.
- M6 (bill deletion leaving receipt) → eliminated by design.
- No EXIF strip needed (nothing stored).

## Acceptance criteria

- [ ] Scan (OCR chain) → prefilled form → user confirms → bill +
      line-item TEXT saved; image discarded.
- [ ] No image bytes persisted anywhere (no blob, no DB).
- [ ] Fast and stays fast at 1000 labels (#031).
- [ ] Loading states: skeletons, never blank cards.

## Lane status (subagent, 2026-09-07)

The in-flight lane completed the original brief (red→green): attachments
table + bills.attachmentId (`sql/009-attachments.sql`, applied to both
Docker DBs), receipts endpoints + bill attach/detach, expandable bill
detail UI, and the surviving scan seam — `receiptScan.ts` (50 table-driven
heuristic tests) + `receiptOcr.ts` engine chain (Prompt API probe → native
bridge stub → tesseract.js worker, 5 chain tests) with OCR→prefill flow.
All gates green at handoff: 1513 unit tests, oxlint 0/0, svelte-check 0/0,
build ✅, e2e bills+mobile 4 passed. Per the DECISION CHANGE above, the
storage-side slice (schema/endpoints/bill-detail attach UI) is flagged for
removal by the follow-up slice; the scan seam + prefill flow stays.

Blocked by: #004 (done).
