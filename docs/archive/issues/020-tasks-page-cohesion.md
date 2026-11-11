# 020 — Tasks page visual cohesion

Status: done

## Needs doing

- (done 2026-09-06, commit 8d822d7 — see Done)

## Done

- Tasks page restyled to card vocabulary: header hero card (count
  subtitle), add-task card (input/select/date/Add + "?" help + smart
  templates inside), chips/search/sort as toolbar of the "Your tasks"
  list card, row vocabulary on open/completed/requested rows (amber
  tint kept on pending-accept rows), empty state in-card, family-hub
  container (max-w-4xl, slate-50, pb-20). Zero script-logic changes;
  all #019 function intact; no e2e selector changes.
- Gates: e2e mobile 2 ✅, oxlint/prettier/check 0, build ✔, autofixer
  clean (legacy-mode config false positive noted).
