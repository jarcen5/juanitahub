
-- API roles should never receive database-maintenance privileges on application tables.
revoke maintain on all tables in schema public from anon, authenticated;

-- Juanita Hub application tables are postgres-owned. Prevent future migrations from
-- reintroducing maintenance/DDL-adjacent privileges for browser API roles.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;
;