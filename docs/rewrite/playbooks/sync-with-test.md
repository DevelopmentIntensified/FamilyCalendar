# Playbook: merge `test` into `rewrite/v2`

Website and server code on `test` is frozen until cutover, except urgent fixes (owner, [Q-001](../questions.md)). Android work continues there. So a merge usually brings `apps/android/**` changes and, rarely, an urgent fix. An urgent fix to a module this branch has already rebuilt is the "deleted" row in the conflict table below. Merge before each module port, and whenever `git log --oneline HEAD..origin/test` is non-empty.

1. Start clean: `git status` shows nothing to commit.
2. Fetch and merge:

   ```bash
   git fetch origin
   git log --oneline HEAD..origin/test
   git merge origin/test
   ```

   Never rebase: this branch is pushed and shared.
3. Resolve conflicts with these rules:

   | path | rule |
   |---|---|
   | `apps/android/**`, `fdroid/**`, `static/fdroid/**`, `src/lib/fdroid/published.json` | take `test`'s version (`git checkout --theirs <file>`) |
   | a legacy file this branch has **not** touched | take `test`'s version |
   | a legacy file this branch **rewired** (imports changed) | keep `test`'s logic and this branch's import lines |
   | a legacy file this branch **deleted** (modify/delete conflict) | the change belongs in the v2 module. Read it with `git show <their commit> -- <file>`. Add a failing test in the module (a golden test if it changed an API response, and note it in the ledger). Implement the change. Then `git rm <file>` |
   | `docs/issues/**` | take `test`'s version; new tickets stay active in `docs/issues/` |
   | `sql/migrations/**` | take `test`'s version. A new migration file is fine: the db tests pick it up. Also add it to the bundle list in the migrations scripts file (parity test) |

4. If the merge brings **new legacy files**, add each one to `scripts/arch/legacy-map.json` with its module. This is the only time that map grows. Say so in the merge commit message.
5. Run `npm run gate`, commit the merge, and push.
6. In [LEDGER.md](../LEDGER.md), add a row `SYNC yyyy-mm-dd` with the merge sha. List every change you re-applied to a v2 module.
