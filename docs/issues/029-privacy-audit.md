# 029 — Privacy audit: receipts + data flows

Status: in-progress

## Design-level findings (orchestrator, 2026-09-06)

- **PUBLIC receipt URLs (HIGH)**: blobService stores publicly; receipts
  must NOT be public — personal financial images. Required: private
  blobs + short-lived signed URLs served via an auth-gated route, or
  proxy through `/api/receipts/[id]/image` (auth check → signed URL).
  Attach/view UI must use the proxied URL only.
- **Deletion cascade (HIGH)**: bill/attachment/account deletion must
  delete the BLOB, not just the row — otherwise orphaned financial
  images persist in storage forever. deleteUser + removeFamilyMember +
  bill delete paths need blob cleanup (and a periodic orphan sweep is
  worth noting).
- **Scan locality (GOOD, must stay)**: tesseract.js runs on-device;
  receipt images must not be uploaded for scanning — only attached when
  the user confirms. If a vision LLM path is added later, images leave
  the device → must be opt-in with disclosure.
- **Text-parse third parties (DISCLOSE)**: quick-add + share-target text
  goes to Cerebras (third-party). Privacy policy must name it. Receipt
  text extracted on-device then stored in bill title is fine.
- **Family visibility**: define who can view a receipt (bill viewers per
  canMutateBill/bill visibility rules) — document in the receipts spec.
- **Blob access key hygiene**: verify API keys server-only (env), no
  client-side upload tokens.

## OCR solutions audit (2026-09-06)

- tesseract.js / Chrome Prompt API / ML Kit / iOS Vision: fully
  on-device, zero retention, zero training — best privacy; browser/
  native platform limits noted (Prompt API images = desktop only).
- Azure Document Intelligence prebuilt-receipt: best cloud posture —
  24h auto-delete of input+results, instant-delete API, no training,
  region pinning, on-prem container option.
- AWS Textract: no training on customer content, opt-out policies,
  SOC/ISO/HIPAA — good.
- Google Cloud Vision: no training use under Cloud terms — fine.
- Gemini API FREE tier: ❌ BANNED for this app — trains by default
  (no opt-out), 55-day retention with human reviewers, contractually
  prohibits EEA/UK/Swiss users and apps directed at under-18s (we have
  a Kids' Schedule). Paid tier = no training but Vertex AI needed for
  full DPA/EU residency/ZDR. Any vision-LLM path must be paid-tier,
  opt-in, disclosed.
- Cerebras (existing text LLM): retention/training policy to verify —
  assigned to the running read-only auditor.
- **NEW HIGH: EXIF/GPS stripping** — phone photos embed GPS (home,
  school, routine). Strip EXIF at capture (canvas re-encode in browser)
  before ANY receipt is stored in Blob, regardless of OCR engine.
  Applies to the local-attach path too, not just cloud OCR.
- Storage remains the bigger surface than OCR: private blobs +
  auth-gated access + blob deletion cascade (see design findings).

## Auditor results (read-only sweep, 2026-09-06)

**HIGH**
- H1: `blobService.uploadReceiptAsset` uses `access: 'public'` and the
  API returns the raw blob URL; filenames embed internal user IDs.
  → private blobs + signed short-lived URLs or auth-proxied reads.
- H2: `deleteUser` + anon-cleanup cascade the attachment ROW but never
  delete the BLOB → public receipt images survive account deletion.
  → delete blobs in-tx (best-effort) + periodic orphan sweep.
- H3: bulk-AI path sends all event titles/calendar names to Cerebras
  and ignores the `useCloudAI` opt-out (parse-event honors it).
  → honor setting + disclose.

**MED**
- M1 privacy policy names no processors (Cerebras, Resend, Vercel,
  Neon, Nominatim, ESV). NOTE (2026-09-07): Resend Inbound will also
  RECEIVE + RETAIN user-forwarded receipt emails (#033) — the privacy
  policy must disclose both sending AND receiving storage by Resend.
- M2 service worker caches authed /api/events + /api/tasks GETs,
  never cleared on logout → cache purge on logout + age cap.
- M3 location-search strings → Nominatim with static UA; disclose,
  proper UA, don't log queries.
- M4 PII (emails, user ids) in server logs (analyticsService, email).
- M5 unmatchedPhrases + bugReports kept forever, no purge on user
  deletion → cron retention (e.g. 180d), redact URL query strings.
- M6 deleteBill leaves attachment row + public blob alive.

**LOW** (tracked, not urgent): 90-day session lifetime; share-target
GET-redirect log residue (scrub verified client-side); login/code 500
shape; recent-locations localStorage affordance; spoofable rate-limit
keying.

**Verified clean:** cookie flags, CSRF origin checks, admin gating,
email enumeration masks, claim tokens, push encryption + payload
privacy, error hygiene, admin-only surfaces, e2e fixtures synthetic,
no analytics scripts, per-object receipt authz on the DELETE endpoint.

**Sequencing:** H1/H2/M6 are blockers on the receipts feature — fix
lane runs immediately after the receipts lane lands, before it ships.
Then H3/M1/M2 (privacy-fix slice), then the OCR fallback chain.

## Done (privacy-fix slice, 2026-09-07)

- **H3**: `planBulkEditsWithAI` now honors the cloud-AI opt-out — returns
  `[]` with NO LLM call when `useCloudAI` or `autoParseEventDetails` is
  off (`BulkAiSettings` param; mirrors parse-event). Data minimisation:
  only events NAMED in the instruction ship their title/location to
  Cerebras; untargeted events go as id + start. 5 new table tests on the
  `./llm` mock seam. Note: the function currently has no production
  caller (the bulk route runs the local planner only) — the gate is armed
  for when the AI path is wired.
- **M1**: privacy policy processor table added (Cerebras — verbatim
  quick-add text, opt-out via cloud-AI setting; Resend — name/email for
  magic links + resets; Vercel — hosting/logs/ad images, receipts never
  stored; Neon — app data; Nominatim — location search strings; Crossway
  ESV — verse text, no user data) + on-device receipt processing note.
- **M2**: logout purges the SW DATA cache three ways — SW intercepts
  POST /api/logout (works even for the plain HTML form), Navbar logout
  forms postMessage `purge-data-cache`, and a `message` handler deletes
  the cache. Data cache entries now carry a 1-day age cap
  (`x-cached-at`, stale entries dropped, legacy unstamped entries purge
  on first offline hit). No SW test seam exists — verified by code
  reasoning + e2e bills/mobile passing with the new fetch handler live.

## Needs doing

- **CHANGE (2026-09-07)**: user decreed NO receipt image storage —
  process-and-delete. H1/H2/M6 below are ELIMINATED BY DESIGN: the strip
  slice removed the storage side (attachments table, /api/receipts, blob
  prefix, bills.attachmentId — sql/010 applied to both DBs).
  What remains of this audit for receipts: nothing image-related; text
  parse data (bill title/merchant) is ordinary app data.
- H3 (bulk-AI ignores useCloudAI), M1 (privacy policy processors),
  M2 (SW logout purge): DONE 2026-09-07 (see Done above).
- EXIF stripping: MOOT (no image persisted anywhere). The canvas re-encode
  in `stripExif` survives only for the opt-in Azure cloud send, which
  auto-deletes server-side within 24h.
- **M3** (Nominatim static UA / query logging), **M4** (PII in server
  logs), LOWs: still open.
- **M5 — retention purge. SHARPENED 2026-09-29. This is the SAME gap as
  the existing cleanup cron, not a separate project.** The weekly cron
  already exists and is wired: `vercel.json` schedules
  `GET /api/cron/cleanup` ("0 4 * * 1"), implemented at
  `src/routes/api/cron/cleanup/+server.ts:10-31`. It prunes exactly two
  things: stale unclaimed Anonymous Accounts past the 90-day inactivity
  window (`getStaleAnonymousUsers` + `deleteUser`) and expired claim tokens
  (`deleteExpiredClaimTokens`). Nothing else is pruned anywhere in the
  codebase, so four tables grow unbounded for the life of the account:
  - `notifications` — no purge, no read state expiry.
  - `unmatchedPhrases` — NLP misses kept forever (and note: the `deleteUser`
    cascade does not clear them either, so they outlive the account).
  - `bugReports` — the auto-filed report queue is never trimmed.
  - `adEvents` — ad/impression rows, never pruned.
  **Fix shape:** extend `runCleanup()` in the same handler — it already has
  the secret check, the weekly cadence and the response envelope, so this is
  an additive sweep, not new infrastructure. Suggested windows (pick one,
  record the decision here):
  - 180 days for RESOLVED `unmatchedPhrases` and for RESOLVED `bugReports`
    (keep the open ones; they are the working queue).
  - 90 days for READ `notifications` (unread must survive until acted on).
  - `adEvents` needs a product decision, not just a window — analytics
    retention is a separate call, and it may be better served by an
    aggregate/rollup than a delete.
  Also still owed from the original M5 text: redact URL query strings before
  persisting an unmatched phrase (they carry whatever the user typed after
  the command).
  **Do not file a new issue for this** — it is a slice of the existing cron.
