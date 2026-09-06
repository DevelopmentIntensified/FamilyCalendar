-- Creates the second database unit/e2e tests use (.env.test points here).
-- The dev DB (`familycalendar`) is created by POSTGRES_DB above.
CREATE DATABASE familycalendar_test;
GRANT ALL PRIVILEGES ON DATABASE familycalendar_test TO postgres;
