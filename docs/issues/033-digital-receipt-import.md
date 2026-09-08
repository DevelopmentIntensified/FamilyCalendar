# 033 — Digital receipt import (paste / PDF / email)

Status: done

Parent: #010/#031 receipts pipeline (reuses the scan→prefill→confirm flow;
no OCR involved — digital receipts are already text).

## Design (hands-off assumptions; one open decision flagged)

- **v1 — Paste text**: "Paste receipt text" affordance on the bills
  create form → server extraction via the existing Cerebras text LLM
  (chatJson — text-only, already wired, honors the `useCloudAI`
  opt-out per H3 fix) → structured `{merchant, total, date,
lineItems[{label, priceCents}], tax?, fees?}` → prefilled bill +
  editable Line Items (#031) → user confirms. Deterministic fallback if
  LLM unavailable/unconfigured: regex heuristics (reuse receiptScan
  total/date/merchant logic on text).
- **v1 — PDF receipts**: pdf.js in-browser text extraction → same
  pipeline (text never leaves device except the LLM call, same as
  quick-add; disclosed). TEXT-LAYER PDFs extract cleanly; IMAGE-ONLY
  (scanned) PDFs are detected (empty text) and routed through the
  OCR Chain (page → canvas → tesseract → Azure opt-in) — one pipeline,
  two entry points. Multi-page: pages concatenate in order. Extraction
  prompt is invoice-layout-tolerant (bill-to, line items, subtotal,
  tax, fees, total) so tax/fees come out as their own Line Items.
- **Email forwarding — IN SCOPE via Resend Inbound** (user correction
  2026-09-07; Resend ships `email.received` webhooks with parsed
  content + attachments):
  - Each user gets a personal ingest address (random token local-part
    on our receiving domain) shown on the bills page; nothing matches
    user identity except that token.
  - Webhook route (signature-verified) → match token → parse
    body/PDF-attachment text → LLM structure (same prompt as PDF path)
    → **pending bill draft** for review — never auto-saved, consistent
    with "a parse is a hint".
  - PDF attachments: text extracted server-side at webhook time; the
    file is never persisted by us. Resend DOES retain received emails
    (their storage) — must be disclosed in the privacy policy (M1).
  - Spam: import creates a reviewable draft, not a bill; user deletes
    or confirms. Opt-in feature = consent to the parsing flow.
  - Resend setup needed from user: enable Receiving on the domain +
    point the webhook at the new route (URL handed over at build).
- Privacy: pasted text goes to Cerebras like quick-add (disclosed,
  opt-out respected); PDF text extracted in-browser, only the text is
  sent; the PDF file itself is never stored.
- TDD: extraction prompts + parser fallback via mocked LLM seam
  (llmConfigured pattern); line-item mapping tests; PDF extraction
  seam mocked.

## Needs doing

- DONE (2026-09-07). Shipped:
  - Paste text: `POST /api/parse-receipt-text` (auth, 20KB cap, rate
    limit) → Cerebras `chatJson` with `RECEIPT_EXTRACTION_PROMPT`
    (honors `useCloudAI` opt-out; LLM failure → deterministic regex
    fallback). Extraction lives in
    `src/lib/server/services/receiptText.ts` (pure, both producers).
  - PDF: `src/lib/client/receiptPdf.ts` — pdfjs-dist 5.4.149 (pinned,
    lazy dynamic import, CDN worker), pages joined; empty text → routed
    to the Scan flow. Server PDF text (email attachments) via
    `pdfjs-dist/legacy` in `src/lib/server/services/pdfText.ts`; bytes
    never persisted.
  - v2 HARDENING (2026-09-07): `importReceiptPdf` replaces the scan
    dead end. Text layer first; pages with <20 chars of text render to
    canvas (pdf.js render, 2x scale) → existing on-device OCR chain
    (`receiptOcr.ts`, process-and-delete) → concatenated with text
    pages in order → same parse pipeline. Mixed PDFs: only scan pages
    get OCR'd. Failures classified: `password` (PasswordException →
    remove password or Scan receipt), `open-failed` (corrupt),
    `worker-failed` (CDN blocked), `unreadable` (OCR read nothing).
    Page cap 5 (`PDF_IMPORT_PAGE_CAP`) — large PDFs are truncated with
    an inline note, never rejected. Canvas/page cleanup on every path
    (`doc.destroy()` in finally, `page.cleanup()` after render).
  - Email: `POST /api/email-ingest` (svix signature verification,
    manual HMAC — `src/lib/server/utils/svixVerify.ts`), token match on
    `receipts.<token>@<RECEIPT_INGEST_DOMAIN>` → user via
    `users.receiptIngestToken`; creates a DRAFT bill (`bills.source`
    'email', paidAt null — excluded from Spend Detail, no Tag Table
    training). `POST /api/receipt-ingest-address` GET/POST for the
    address (hidden when env unset; regenerate supported). Bills page
    shows the address (copy/regenerate) and drafts get a "From email"
    badge + Confirm button (confirm flips source to 'manual' AND trains
    the Tag Table).
  - SQL: `sql/012-receipt-import.sql` (bills.source + users.receiptIngestToken;
    applied to both local DBs; Neon block inside).
  - Privacy page: inbound receipt email row (Resend retains received
    mail; we never store the email/PDF).
- Known pre-existing flakes (unrelated): `azureReceiptService.test.ts`
  timeout test and `e2e/events/NlpTimeParsing.test.ts` fail under full-
  suite load / on clean HEAD too.
- Queued: before #006 (user priority call at dispatch).
- Limitations (v2):
  - PDFs >5 pages: only the first 5 are read (inline note says so) —
    receipts longer than 5 pages are rare; raising the cap costs
    render memory on phones.
  - OCR quality depends on scan sharpness — unreadable scans get a
    specific "couldn't read" message, not a silent failure.
  - Password-protected PDFs are detected, not opened — removing the
    password client-side is out of scope.
  - The pdf.js CDN worker means first-use PDF import needs network;
    blocked CDN → explicit "reader couldn't load" message (no crash).
  - OCR'd PDF text and photo-scan text both go to the same
    /api/parse-receipt-text endpoint; per-page OCR of huge mixed
    documents is sequential (one tesseract worker, by design).
