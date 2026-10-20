-- Failed logins are counted per account and caller address, so people guessing a shared
-- account's password lock only themselves out, not the owner. app_users.failed_login_count
-- stays as an account-wide limit (much higher) against guessing from many addresses.
CREATE TABLE login_failures (
  user_id VARCHAR(255) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  ip TEXT NOT NULL,
  failed_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ip)
);
CREATE INDEX idx_login_failures_updated ON login_failures (updated_at);

SELECT lock_public_schema();

-- Egyptian mobiles in one stored form (01XXXXXXXXX), as server/schemas.ts normalizePhone does
-- for new input. A phone whose local form already belongs to another account is left as it is.
WITH canon AS (
  SELECT id,
         '0' || substring(regexp_replace(phone, '[\s()-]', '', 'g') FROM '^(?:\+20|0020|20)?0?(1[0125][0-9]{8})$') AS phone
  FROM app_users
),
pick AS (
  SELECT c.id, c.phone, row_number() OVER (PARTITION BY c.phone ORDER BY c.id) AS n
  FROM canon c JOIN app_users u ON u.id = c.id
  WHERE c.phone IS NOT NULL AND u.phone <> c.phone
    AND NOT EXISTS (SELECT 1 FROM app_users o WHERE o.phone = c.phone)
)
UPDATE app_users u SET phone = pick.phone, updated_at = NOW()
FROM pick WHERE u.id = pick.id AND pick.n = 1;
