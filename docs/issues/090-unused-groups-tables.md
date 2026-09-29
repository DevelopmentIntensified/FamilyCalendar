# 090 — Three tables have never been used: groups, userGroups, familyGroups

Status: open

Source: instruction — technical-debt sweep of schema, migrations, and dead code.

**Blocked by:** 086 (migration baseline — these three have no migration either,
so dropping them is a schema change on a database that cannot yet be rebuilt
from the runner).

## The problem

Three tables are declared in the schema, joined to each other and to real tables,
and read by nothing. No route, no query, no action, no foreign key points at
them. They are a Grouping feature that was designed and never built: a family
could have named groups, a user could belong to groups, and a group could be
scoped to a family.

The identifiers appear **only** at their own declarations. Every other hit for
"group" in the app is a local variable or prose.

One live consumer exists outside `src/`: two end-to-end specs delete
`userGroups` rows in their account-deletion and family-creation cleanup helpers.
That is test scaffolding writing to a table the app never populates — deleting
the table breaks those two specs and nothing else.

None of the three is created by any bundled migration either; they came from
the same push that created the other 18. See 086.

## Needs doing

- [ ] Decide the fate: drop them, or admit they are a planned feature and give
      them an owner. Leaving three tables and two join tables in a schema that
      already reads as authoritative is the worst of the three answers.
- [ ] If dropping: remove the declarations, drop the columns that reference
      them from the two end-to-end cleanup helpers, and hand the user a manual
      `DROP TABLE` migration (children first — the two join tables reference the
      groups table).
- [ ] Whatever the answer, make the schema stop implying a feature exists.

## Done

## Notes

- Not zero-risk: dropping a table is irreversible, and 086 must land first so a
  database can be rebuilt and verified.
- If the Grouping feature is actually wanted, this becomes a feature ticket, not
  a cleanup one. Ask before deleting.
