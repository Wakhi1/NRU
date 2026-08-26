-- One-off fix for production: widens an existing integration API key's scopes to the full set
-- this app now supports. Needed when a key was created before the `identity`/`mfa`/`audit`
-- categories existed (see docs/INTEGRATION.md) — the code is already deployed and correctly
-- rejects the key for the scope it's missing; this just grants what SPTS (or any other
-- integration) actually needs. No app restart required — scopes are read fresh on every request.
--
-- HOW TO USE (phpMyAdmin, no SSH needed):
--   1. Run STEP 1 alone first (select it, then "Go") to see your existing keys and their id/name.
--   2. Copy STEP 2, replace <ID> with the real id from step 1's result for the key SPTS uses,
--      then run it.
--   3. Run STEP 1 again to confirm the `scopes` column updated.

-- STEP 1 — list existing keys
SELECT id, name, scopes, is_active FROM api_key ORDER BY id;

-- STEP 2 — grant the full scope set to one key by id (replace <ID>)
UPDATE api_key
SET scopes = 'employees:read,devices:read,timesheets:create,timesheets:read,timesheets:update,org:read,audit:create,mfa:read,mfa:create,identity:create'
WHERE id = <ID>;
