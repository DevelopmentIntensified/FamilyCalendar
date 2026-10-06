# 161 — Advisory: transitive dependencies — runtime and build-time buckets

Status: open

Source: security audit (issue 136), 2026-10-06. Rank 15/15 — mostly build-time chains or unreachable code paths; one runtime chain worth an upgrade decision.

## Done

- Audit totals (2026-10-06): `npm audit --omit=dev` → 28 (3 critical / 19 high / 6 moderate); full `npm audit` → 58 (6 critical / 34 high / 15 moderate / 3 low).
- **Runtime chains (prod dependencies):**
  - `@vercel/blob@0.27.3` → `undici@5.29.0` (14 high: request smuggling, CRLF, cookie injection, response queue poisoning) + `@fastify/busboy` high. Fix per npm: `@vercel/blob@2.8.1` — **semver-major 0.27→2.x**. Reachability uncertain: Node 24 runtime uses global fetch; undici may not execute on the blob upload path — verify before/after upgrade. Uses: file/blob storage (`@vercel/blob` imported for uploads).
  - `resend@4.1.2` → `@react-email/render` → `js-beautify` → `js-cookie@3.0.5` high (prototype hijack → cookie-attribute injection). js-cookie never imported by app code (react-email preview path unused; app sends raw HTML via `sendEmail`) → not reachable; `npm audit fix` clears it cheaply.
  - `@ngneat/falso@7.3.0` → `uuid@8.3.2` moderate (v3/v5/v6 buffer bounds). App uses only `randHex` (`createNewUser.ts:5`) → v3/v5 APIs unused → not reachable; accept.
- **Build/install-time chains (dev):** `tar@≤7.5.20` critical ×12 and `@xmldom/xmldom@0.8.10` high ×17 via `@capacitor/cli` (see issue 157); `nanoid@3.3.8` via `postcss`; `yaml`, `brace-expansion`, `braces`, `micromatch`, `minimatch`, `picomatch`, `glob`, `chokidar`, `fast-glob`, `editorconfig`, `source-map-js`, `tailwindcss` — install/lint/build-time only, no server execution.
- **Checked, no advisory (explicitly not-applicable):** `postgres@3.4.5` (client, current 3.4.9), `oslo@1.2.1`, `lucia@3.2.2` (archived upstream, no CVE), `bcryptjs@3.0.3`, `luxon@3.5.0`, `web-push@3.6.7`, `arctic@3.4.0`, `resend` core, `pdfjs-dist@5.4.149`, `tesseract.js@6.0.1`, `drizzle-kit@0.31.10`, `@sveltejs/adapter-vercel@5.6.3`, `adapter-static@3.0.8`, `adapter-node@5.2.11` (unwired), `@capacitor/core@7.0.1`, `dotenv@16.4.7`, `@oslojs/crypto`, `@vercel/blob` itself (flagged only via undici).

## Needs doing

- Option A — `npm audit fix` (non-breaking) for js-cookie/nanoid/yaml/dev chains + manual major bump `@vercel/blob@2.8.1`. Cost: blob is 0.x→2.x — audit call sites, retest uploads, watch the undici chain clear (`npm ls undici`).
- Option B — targeted `overrides` (e.g. `undici>=6.28.1`, `js-cookie>=3.0.6`) without majors. Cost: forcing majors under an old parent risks subtle incompatibility (blob is unmaintained at 0.27); needs upload-path tests either way.
- Not choosing (issue 136).
