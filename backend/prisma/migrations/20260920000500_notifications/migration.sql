-- A device token belongs to one account at a time. Keep the newest legacy row.
DELETE FROM device_tokens AS old
USING device_tokens AS newer
WHERE old.token = newer.token
  AND (old.created_at, old.id) < (newer.created_at, newer.id);
DROP INDEX "device_tokens_user_id_token_key";
CREATE UNIQUE INDEX "device_tokens_token_key" ON device_tokens(token);
ALTER TABLE device_tokens
  ADD COLUMN locale VARCHAR(8),
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN last_seen_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN deactivated_at TIMESTAMPTZ(6);
UPDATE device_tokens SET last_seen_at = created_at;
ALTER TABLE device_tokens ADD CONSTRAINT device_tokens_platform_check
  CHECK (platform IN ('android', 'ios', 'web'));

CREATE TABLE notification_channel_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  channel VARCHAR(8) NOT NULL,
  enabled BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT notification_channel_preferences_pkey PRIMARY KEY (user_id, type, channel),
  CONSTRAINT notification_channel_preferences_type_check CHECK (type IN
    ('order_placed','order_confirmed','order_status_changed','out_for_delivery','delivered',
     'delivery_failed','return_update','loyalty_points_earned','review_moderated','promo')),
  CONSTRAINT notification_channel_preferences_channel_check CHECK (channel IN ('push','sms')),
  CONSTRAINT notification_channel_preferences_critical_check
    CHECK (NOT (type = 'order_confirmed' AND channel = 'sms' AND enabled = false))
);

CREATE TABLE notification_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  event_key VARCHAR(160) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enqueued_at TIMESTAMPTZ(6),
  processed_at TIMESTAMPTZ(6),
  CONSTRAINT notification_events_pkey PRIMARY KEY (id),
  CONSTRAINT notification_events_event_key_key UNIQUE (event_key),
  CONSTRAINT notification_events_type_check CHECK (type IN
    ('order_placed','order_confirmed','order_status_changed','out_for_delivery','delivered',
     'delivery_failed','return_update','loyalty_points_earned','review_moderated','promo'))
);
CREATE INDEX idx_notification_events_pending ON notification_events(enqueued_at, created_at);

CREATE TABLE notification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  channel VARCHAR(8) NOT NULL,
  delivery_key VARCHAR(120) NOT NULL,
  status VARCHAR(8) NOT NULL,
  locale VARCHAR(8) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ(6),
  error VARCHAR(500),
  CONSTRAINT notification_logs_pkey PRIMARY KEY (id),
  CONSTRAINT notification_logs_delivery_key_key UNIQUE (delivery_key),
  CONSTRAINT notification_logs_status_check CHECK (status IN ('queued','sent','skipped','failed')),
  CONSTRAINT notification_logs_channel_check CHECK (channel IN ('push','sms'))
);
CREATE INDEX idx_notification_logs_user_history ON notification_logs(user_id, created_at DESC, id DESC);
