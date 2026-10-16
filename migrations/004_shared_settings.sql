-- Migration 004: data that used to live only in each browser's localStorage,
-- so web and mobile now share it.

CREATE TABLE books (
  id VARCHAR(255) PRIMARY KEY,
  name TEXT NOT NULL,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_books_name ON books (lower(name));

CREATE TABLE permission_profiles (
  id VARCHAR(255) PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  badge_color TEXT,
  allowed_tabs JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_committees JSONB NOT NULL DEFAULT '[]'::jsonb,
  all_committees_allowed BOOLEAN NOT NULL DEFAULT false,
  allowed_exam_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  all_exams_allowed BOOLEAN NOT NULL DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_permission_profiles_updated_at
  BEFORE UPDATE ON permission_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

CREATE TABLE custom_permissions (
  id VARCHAR(255) PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications: NULL target_user_id = visible to everyone; read state is per user.
ALTER TABLE notifications ADD COLUMN target_user_id VARCHAR(255) REFERENCES app_users(id) ON DELETE CASCADE;
CREATE TABLE notification_reads (
  user_id VARCHAR(255) NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  notification_id VARCHAR(255) NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_id)
);
-- The old global flag cannot be attributed to a user, so it is dropped.
ALTER TABLE notifications DROP COLUMN read;
