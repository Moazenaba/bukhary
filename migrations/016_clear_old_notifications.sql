-- Migration 016: clears every notification that exists today.
--
-- The notices in the system were created while testing and before each course stood alone, so
-- they are removed once. Their read marks go with them (notification_reads cascades). Notices
-- created after this migration are untouched; nothing else is changed.

DELETE FROM notifications;
