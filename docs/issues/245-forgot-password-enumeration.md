# 245 — Forgot-password shows red error for unknown emails (account enumeration)

Status: done

Source: repo bug audit 2026-11-01 (lane E).

## Evidence

`src/routes/(marketing)/forgot-password/+server.ts:59` `json({ error: 'If an account exists…' }, {status:200})`; page treats `json.error` as failure.

## Repro

Unknown email -> red banner; known -> success screen.

## Done

- Unknown email (and Anonymous Account placeholder addresses) now return `{ success: true }` — identical to a real send, no mail sent. Page's existing "If an account exists for …" success screen covers both. Tests in `forgot-password/server.test.ts` (unknown -> `{success:true}`, placeholder -> no send).
- Residual: response-time difference (no JWT/send on unknown) remains a weak timing oracle; not addressed.

## Needs doing

(none)
