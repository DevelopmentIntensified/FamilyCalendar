# 063 — Archive the bills/money surface to `_attic/money`

Status: done

## Done

- **Directive** (2026-09-25, live): user "ignore the money dir / bills", then
  "remove them" → "copy all to other dir" → "move to archive". Supersedes the
  09-08 PAUSED note in STATUS.md: the area is OUT of the app, not paused.
- `git mv` (history-preserving) of the whole surface to `_attic/money/`,
  original paths preserved:
  - Routes: `(bills)/` group (bills + spending pages/layouts),
    `(calendar)/calendar/{bills,spending}`,
    `api/{bills,parse-bill,scan-receipt,parse-receipt-text,
    receipt-ingest-address,email-ingest}`.
  - Lib: `client/receiptOcr*`, `client/receiptPdf*`, `utils/receiptScan*`,
    `utils/pdfVersion.ts`, `workers/receiptOcr.worker.ts`,
    `services/{azureReceiptService,billSave,merchantProfiles,receiptText,
    tagTable,spendDetail,pdfText}*`, `db/actions/{bills,receiptIngest}*`.
- Kept: `data/categories.ts` + `db/schema` bills tables (DB untouched;
  NLP imports `categoryForKeyword` + `BILL_CATEGORIES`) and
  `naturalLanguageService.parseBillQuickAdd` (unused export, no archived
  imports).
- Cut stray imports: `categories.test.ts` cloud drift-guard block removed
  (tested the archived `cloudScanReceipt`).
- Verified: `npm run build` green; `categories` + `naturalLanguageService`
  suites 508 passed.

## Needs doing

- (none — no schema/SQL migration; tables + data stay in place)
