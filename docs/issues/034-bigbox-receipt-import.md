# 034 — Big-box receipt import (Home Depot, Lowe's, Walmart, Amazon)

Status: done

## Done

- e2e real-PDF fixture (`e2e/test-data/testrecipt.pdf` + PdfRealReceipt test).
- Shared category vocabulary (`src/lib/data/categories.ts`).
- Merchant detection from pasted/PDF/email receipt text: Home Depot, Lowe's, Walmart, Amazon (header patterns).
- Merchant-specific line-item + totals extraction (HD/Lowe's stock#/SKU lines, Walmart `*` items + TC footer, Amazon digital invoice Items-Ordered/Grand-Total shape).
- Merchant → bill category mapping (HD/Lowe's → housing; Walmart/Amazon → other, Tag Table learns specifics).
- Merchant names in the shared keyword table so prefill suggests the right category.
- Fixture texts per merchant (synthetic, format-faithful) as TDD phrase tables.
- Docs: which formats are recognized + fallback behavior for unknown layouts.

## Implementation (2026-09-08)

- NEW `src/lib/server/services/merchantProfiles.ts` (+ test, 28 tests):
  `detectMerchant` (header/footer patterns, case-insensitive) +
  `extractMerchantDraft` → { merchant, items, subtotal?, tax?, total?, date? }.
- `receiptText.ts` additive only: `extractReceiptRegex` tries `detectMerchant`
  first, converts via `merchantDraftToRegexDraft` (tax → own 'tax' item, #031),
  else the generic path UNCHANGED (existing tests pass unmodified).
- Categories: HD/Lowe's keywords already in the housing table (no change);
  Walmart/Amazon deliberately keyword-less → `categoryForKeyword` null →
  `suggestCategory` falls back `other`; Tag Table learns specifics. Pinned by
  9 new `categoryForKeyword` tests.
- `receiptOcr.ts`: read-only — `CloudReceiptScan.lineItems` carries no
  category field today, so no label hookup; unchanged.

## Recognized formats + fallback

- Home Depot: `THE HOME DEPOT` / `home depot #N` header, SKU-prefixed rows
  (`0435932 QUIKRETE … 5.47`), SUBTOTAL / SALES TAX / TOTAL, store#/cashier
  headers skipped.
- Lowe's: `LOWE'S` / `lowes` header, `SALE` header, item-number runs,
  SUBTOTAL / TAX / TOTAL.
- Walmart: `Walmart` / `WM Supercenter` header, `*`-suffixed taxable rows,
  SUBTOTAL / TAX n / TOTAL, `TC#` footer skipped.
- Amazon: `amazon.com`, or `amazon` + (`order details` | `grand total` |
  `asin`), or `grand total` + `asin` without the word; `N of: label $price`
  rows, `Qty: N` multiplies the last row once, `Item Subtotal` /
  `Grand Total`, `Estimated tax…` rows, ASIN runs skipped.
- Fallback: `detectMerchant` null (any other layout, bare `amazon` without
  invoice markers) → generic regex path, behavior identical to before.
