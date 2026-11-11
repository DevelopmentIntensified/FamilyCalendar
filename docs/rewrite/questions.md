# Questions for the owner

The executing agent appends a question here when it is blocked ([when-stuck.md](playbooks/when-stuck.md)). The owner answers inline under **Answer:**. Each answered question stays here as the record.

Template:

```markdown
## Q-NNN <title> (<task id>, <date>)
Context: …
Options:
A. … cost: …
B. … cost: …
Recommendation: …
Answer:
```

## Q-001 Changes on `test` while the rewrite runs (plan, 2026-11-11)

Context: `test` keeps receiving fixes and Android work while `rewrite/v2` ports modules. Every change to an already-ported module has to be re-applied, test-first, to the v2 module.

Options:
A. Keep `test` live; the rewrite merges it before each module ([sync-with-test.md](playbooks/sync-with-test.md)). Cost: re-applying ported-module changes.
B. Freeze web/server changes on `test` except urgent fixes. Cost: no web features until cutover.

Default applied: **A**.

Answer:

## Q-002 Parked modules: port or delete (plan, 2026-11-11)

Context: `meals` (owner-parked) and `bills` (archived to `_attic/money`) still have code, tables and one endpoint (`/api/meals`).

Options:
A. Port as-is: tables and vocabulary for bills; the endpoint and card for meals. Cost: about 400 LOC carried along.
B. Delete the meals endpoint and card; keep only the tables. Cost: removes a parked feature (reversible from git).

Default applied: **A**.

Answer:

## Q-003 Blob store (#180) before the `sponsored` port (plan, 2026-11-11)

Context: `blobService` is public, unmetered and unsniffed. The security audit asked for "harden or delete" before anything wires it further.

Options:
A. Delete the blob code during the sponsored port; ads serve without blob assets. Cost: re-adding it later.
B. Port it behind a `blob` port, private and size-capped. Cost: extra work in M-sponsored.

Default applied: none. **M-sponsored is blocked on this answer.**

Answer:
