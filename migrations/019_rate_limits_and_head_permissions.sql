-- Migration 019
-- 1) Attempt counters per caller address (login, join requests): a short wait after too many
--    attempts from one address, never an account lock-out (the account owner on another device
--    is not affected).
CREATE TABLE IF NOT EXISTS rate_limits (
  key VARCHAR(300) PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- 2) «إضافة لجنة جديدة» (add_new_committee) and «الجدول الزمني» (calendar_schedule) now really
--    decide whether a committee head may add committees and manage tasks. Every committee head
--    who could do so until now keeps the right; an admin removes it where it is not wanted.
UPDATE app_users
SET permissions = (
      SELECT jsonb_agg(DISTINCT p)
      FROM jsonb_array_elements_text(COALESCE(permissions, '[]'::jsonb) || '["add_new_committee","calendar_schedule"]'::jsonb) AS p
    ),
    updated_at = NOW()
WHERE role = 'committee_head';
