-- Migration 017: sign-in no longer locks accounts after wrong passwords.
--
-- Unlocks every account locked today and forgets the failure counts. The columns and the
-- login_failures table stay (nothing reads them now); no other data is changed.

UPDATE app_users SET failed_login_count = 0, locked_until = NULL
WHERE failed_login_count <> 0 OR locked_until IS NOT NULL;

DELETE FROM login_failures;
