-- 019 — Drop the three never-used Grouping tables (#090).
-- They are read by nothing in the app and verified empty (2026-10-23)
-- on both Neon branches (main = ep-plain-cloud, preview/test = ep-bitter-water
-- via scripts/db-exec.mjs), so dropping loses no data.
-- Idempotent: conditional drops in child-before-parent order (userGroups and
-- familyGroups carry FK references into groups; the join tables go first).

DROP TABLE IF EXISTS "userGroups";

DROP TABLE IF EXISTS "familyGroups";

DROP TABLE IF EXISTS "groups";
