# 010 — Bill receipts

Parent: #003 Bill Tracking PRD (story 8).

Status: in-progress

## DECISION CHANGE (user, 2026-09-07): NO receipt image storage

Receipt images are PROCESSED AND DELETED — never uploaded, never stored.
All storage-side work from the in-flight lane (attachments table,
/api/receipts upload, blob prefix, bills.attachmentId) will be removed
by the follow-up slice; the scan seam stays.

## Done (storage strip + scan-seam survival, 2026-09-07)

- Schema: `attachments` table + `bills.attachmentId` removed; type
  `Attachment` gone. `sql/010-drop-receipt-storage.sql` (idempotent)
  applied to both Docker DBs (`familycalendar`, `familycalendar_test`);
  `sql/009-attachments.sql` kept as a deprecation note (history).
- Deleted: `src/routes/api/receipts/**`, `attachments.ts` + test,
  `resolveAttachment.ts`, blobService receipt methods (ads API untouched).
- API: bills GET/POST/PUT restored to clean shapes — no attachmentId,
  no `receiptsByBillId`; tests pin that a client-sent attachmentId is
  ignored and GET returns bills only.
- Bills page: attach/thumbnail/detail-image UI removed; expandable detail
  row kept with a "scanned on-device and discarded" note; scan → prefill →
  confirm survives; image is discarded after prefill (process-and-delete);
  toast + inline-confirm delete kept. `stripExif` removed (it only fed the
  upload path; nothing persists, so EXIF concern is moot).
- Test pinning process-and-delete: scan prefill test asserts NO fetch call
  (no upload, no create) happens from a scan.
- Quick-add NLP wired (issue 011): title field debounces POST
  /api/parse-bill (300ms) → prefills title/amount/dueDate/category;
  recurring/frequency/interval parked client-side, never sent to create.
- Gates: 1473 unit tests green (≈1513 minus removed storage tests),
  playwright bills+mobile 4 passed, oxlint 0, svelte-check 0, build ✅.
- #029 privacy wins: H1/H2/M6 eliminated by design (nothing stored).

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

- [x] Scan (OCR chain) → prefilled form → user confirms → bill + text
      saved; image discarded. (Line-item TEXT lands with #031.)
- [x] No image bytes persisted anywhere (no blob, no DB).
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
