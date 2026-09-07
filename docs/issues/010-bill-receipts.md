# 010 — Bill receipts

Parent: #003 Bill Tracking PRD (story 8).

Status: in-progress (scan chain COMPLETE incl. opt-in Azure step;
remaining: line-item text #031, perf criterion)

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

## Done (opt-in Azure cloud scan — final OCR chain step, 2026-09-07)

- Server: `POST /api/scan-receipt` — auth-gated, multipart image
  (jpeg/png/webp, ≤10MB), rate-limited 10/min/IP; env gate
  (`AZURE_DOC_INTELLIGENCE_KEY` + `AZURE_DOC_INTELLIGENCE_ENDPOINT`
  absent → 503 `{ error: 'Cloud scan is not available' }`); calls the
  NEW `src/lib/server/services/azureReceiptService.ts` (Azure Document
  Intelligence prebuilt-receipt, api-version 2023-07-31, injected fetch
  — table-driven mocked-fetch tests, no real network); network/service
  errors → 502 with a plain message; the key never leaves the header.
- Azure field mapping → same normalized shape as the local scan:
  MerchantName→merchant, Total (currency `valueCurrency.amount` or
  `valueNumber`)→totalCents, TransactionDate→date, Items→lineItems
  (Description/TotalPrice), category via the local `suggestCategory`
  keyword table; confidences passed through
  (merchantConfidence/totalConfidence/item confidence).
- EXIF-strip RE-ADDED for the cloud send: `stripExif` (canvas
  re-encode → toBlob('image/jpeg'), byte-wise APP1 fallback) — the
  photo sent to Azure carries pixels only; test pins zero 0xFFE1
  segments in the stripped buffer.
- Client chain completed in `receiptOcr.ts`:
  `cloudScanReceipt` (strip → POST /api/scan-receipt → normalize) and
  `scanReceiptWithFallback(file, { allowCloud })` (local chain → poor
  extraction gate → opt-in cloud; `allowCloud` only ever true after
  the user accepted). 429/503/502 surface as plain user messages.
- Capability flag: bills `+page.server.ts` load adds
  `cloudScanAvailable: boolean` — env PRESENCE only, no key values to
  the client.
- Bills page scan UI: poor local scan + `cloudScanAvailable` → inline
  opt-in prompt (≥44px buttons, flex-col under sm, 320px-safe); accept
  → cloud progress → same prefill path; decline → manual-fill notice,
  image dropped. NEVER auto-send; image held in memory only.
- Gates: 1507 unit tests green, playwright bills+mobile green,
  oxlint 0/0, svelte-check 0/0, build ✅.

## Limitations (cloud step)

- Azure Document Intelligence only maps prebuilt-receipt fields —
  non-receipt photos return nulls and category 'other'; there is no
  retry queue and no fallback beyond the manual fields.
- Rate limit is in-memory (10 scans/min/IP per server instance); the
  502 path surfaces "Cloud scan failed. Try again." — no offline queue.
- The cloud result REPLACES the failed local prefill wholesale; line
  items from the cloud scan are returned but the form prefills
  merchant/total/date/category only (line-item text lands with #031).
- EXIF fallback (byte-wise APP1 strip) only applies to well-formed
  JPEG; non-JPEG passes through untouched — the canvas re-encode is
  the real stripper and runs first in every real browser.
- Setup required (opt-in env, both or none): create an Azure Document
  Intelligence (or Cognitive Services multi-service) resource, then set
  `AZURE_DOC_INTELLIGENCE_ENDPOINT` (e.g.
  `https://<name>.cognitiveservices.azure.com`) and
  `AZURE_DOC_INTELLIGENCE_KEY` (`Keys and Endpoint` → Key 1). Without
  them the UI never shows the cloud prompt (flag false) and the
  endpoint answers 503. Privacy posture (#029): Azure auto-deletes
  submitted images + results within 24h and never trains on them.

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
