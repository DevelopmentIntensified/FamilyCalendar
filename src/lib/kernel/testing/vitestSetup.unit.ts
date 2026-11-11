/**
 * setupFiles for vitest project `unit`: unit tests have NO database. The URL
 * points at a closed port so an accidental query fails fast instead of
 * reaching a real database (the 2026-10-21 prod-touch outage class).
 */
process.env.DATABASE_URL = 'postgres://unit-tests-have-no-database@127.0.0.1:1/none';
process.env.DATABASE_DISABLE_MIGRATIONS = '1';
