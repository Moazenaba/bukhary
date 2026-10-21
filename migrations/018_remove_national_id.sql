-- Migration 018: no ID or passport number is collected or kept any more.
--
-- Deletes the national ID that join requests stored in each user's profile data and clears the
-- passport/ID number column (kept empty so older code paths still find it). Nothing else changes.

UPDATE app_users SET data = data - 'nationalId'
WHERE data ? 'nationalId';

UPDATE app_users SET passport_number = NULL
WHERE passport_number IS NOT NULL;
