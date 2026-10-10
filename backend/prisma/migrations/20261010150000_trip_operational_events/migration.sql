ALTER TABLE "external_driver_trip_events"
  DROP CONSTRAINT "external_driver_trip_events_type_check";

ALTER TABLE "external_driver_trip_events"
  ADD CONSTRAINT "external_driver_trip_events_type_check"
  CHECK ("type" IN (
    'handover',
    'started',
    'delivered',
    'failed',
    'return_at_door',
    'lost',
    'closed'
  ));
