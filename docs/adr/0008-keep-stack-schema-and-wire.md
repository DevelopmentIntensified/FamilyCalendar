# 0008. Keep the stack, the physical schema and the wire contract

Status: accepted (2026-11-11)

The rewrite changes the structure of the code, not its platform or its external contracts.

- **Stack:** SvelteKit 2, Svelte 5 (runes only in new code), TypeScript, Drizzle on postgres-js, Neon Postgres, Vercel, Tailwind 3, vitest and Playwright stay.
- **Schema:** tables, columns, and migration file names (the production tracking keys in `__schema_migrations`) stay unchanged. Moving table definitions between TypeScript files is fine. DDL needs its own owner-approved task.
- **Wire:** every `/api/**` path, method, status code, body field, absent-versus-null rule and error message that the Android app or TaskFocus reads stays the same. Golden tests pin them. The spec is [task-api-spec.md](../guides/task-api-spec.md).
- **URLs:** page URLs stay the same, for bookmarks, the PWA `start_url`, the share target and SEO.

## Why

The pain is structural: hidden dependencies, duplication and fat files. The framework isn't the cause. The Android app ships through F-Droid and can't be updated in lockstep with the server, so any wire change is a breaking change for installed phones. The physical schema is production data. Changing it is a separate, owner-approved decision, never a side effect of a refactor.
