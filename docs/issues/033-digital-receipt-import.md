# 033 — Digital receipt import (paste / PDF / email)

Status: open

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

- Queued: after #031 (Line Items must exist to land imported items)
  → before/after #032, before #006 (user priority call at dispatch).
- RESOLVED: email-forwarding auto-import IS in v1 (Resend Inbound —
  see above).
