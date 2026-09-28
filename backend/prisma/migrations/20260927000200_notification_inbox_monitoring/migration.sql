ALTER TABLE notification_events DROP CONSTRAINT notification_events_event_key_key;

ALTER TABLE notification_events
  ADD COLUMN target_role VARCHAR(32),
  ADD COLUMN title_ar VARCHAR(200),
  ADD COLUMN body_ar TEXT,
  ADD COLUMN title_en VARCHAR(200),
  ADD COLUMN body_en TEXT,
  ADD COLUMN deep_link VARCHAR(500),
  ADD COLUMN read_at TIMESTAMPTZ(6);

UPDATE notification_events
SET target_role = 'customer',
    title_ar = 'إشعار', body_ar = 'لديك تحديث جديد.',
    title_en = 'Notification', body_en = 'You have a new update.',
    deep_link = CASE WHEN entity_type = 'order' THEN '/orders/' || entity_id::text ELSE '/' END;

ALTER TABLE notification_events
  ALTER COLUMN target_role SET NOT NULL,
  ALTER COLUMN title_ar SET NOT NULL,
  ALTER COLUMN body_ar SET NOT NULL,
  ALTER COLUMN title_en SET NOT NULL,
  ALTER COLUMN body_en SET NOT NULL,
  ALTER COLUMN deep_link SET NOT NULL;

ALTER TABLE notification_events DROP CONSTRAINT notification_events_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_type_check CHECK (type IN
  ('order_placed','order_confirmed','order_status_changed','out_for_delivery','delivered',
   'delivery_failed','return_update','loyalty_points_earned','review_moderated','promo',
   'new_order','order_cancelled','delivery_assigned'));
ALTER TABLE notification_events ADD CONSTRAINT notification_events_target_role_check
  CHECK (target_role IN ('customer','delivery_agent','order_monitor','staff'));
ALTER TABLE notification_events ADD CONSTRAINT notification_events_event_key_user_id_key UNIQUE (event_key, user_id);
CREATE INDEX idx_notification_events_inbox
  ON notification_events(user_id, read_at, created_at DESC, id DESC);

ALTER TABLE notification_channel_preferences DROP CONSTRAINT notification_channel_preferences_type_check;
ALTER TABLE notification_channel_preferences ADD CONSTRAINT notification_channel_preferences_type_check CHECK (type IN
  ('order_placed','order_confirmed','order_status_changed','out_for_delivery','delivered',
   'delivery_failed','return_update','loyalty_points_earned','review_moderated','promo',
   'new_order','order_cancelled','delivery_assigned'));

CREATE TABLE notification_stream_events (
  sequence BIGSERIAL NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES notification_events(id) ON DELETE CASCADE,
  event VARCHAR(40) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ(6),
  CONSTRAINT notification_stream_events_pkey PRIMARY KEY (sequence),
  CONSTRAINT notification_stream_events_event_check CHECK (event IN ('notification.created','notification.read','unread.count'))
);
CREATE INDEX idx_notification_stream_events_user_sequence ON notification_stream_events(user_id, sequence);
CREATE INDEX idx_notification_stream_events_pending ON notification_stream_events(published_at, sequence);

DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE key = 'orders.manage');
DELETE FROM preset_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE key = 'orders.manage');
DELETE FROM user_permission_grants WHERE permission_id IN (SELECT id FROM permissions WHERE key = 'orders.manage');
DELETE FROM permissions WHERE key = 'orders.manage';
