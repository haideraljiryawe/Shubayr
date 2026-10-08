-- Phase 8e: external-driver trip documents and fare settlement.

CREATE TABLE "external_driver_trips" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_number" VARCHAR(40) NOT NULL,
  "create_operation_id" VARCHAR(128) NOT NULL,
  "close_operation_id" VARCHAR(128),
  "driver_party_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'open',
  "fare_bearer" VARCHAR(24) NOT NULL,
  "fare_amount_iqd" DECIMAL(20,6) NOT NULL,
  "fare_settlement_method" VARCHAR(24) NOT NULL,
  "fare_cash_account_id" UUID,
  "failure_cancellation_agreement" VARCHAR(500),
  "document_date" DATE NOT NULL,
  "accounting_date" DATE NOT NULL,
  "backdate_reason" VARCHAR(500),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_by" UUID,
  "started_at" TIMESTAMPTZ(6),
  "closed_by" UUID,
  "closed_at" TIMESTAMPTZ(6),
  "expected_cash_iqd" DECIMAL(20,6),
  "received_cash_iqd" DECIMAL(20,6),
  "netted_fare_iqd" DECIMAL(20,6),
  "outstanding_cash_iqd" DECIMAL(20,6),
  "settlement_result" VARCHAR(24),
  "fare_accrual_journal_entry_id" UUID,
  "fare_payment_journal_entry_id" UUID,
  "fare_netting_journal_entry_id" UUID,
  CONSTRAINT "external_driver_trips_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_driver_trips_document_number_key" UNIQUE ("document_number"),
  CONSTRAINT "external_driver_trips_create_operation_id_key" UNIQUE ("create_operation_id"),
  CONSTRAINT "external_driver_trips_close_operation_id_key" UNIQUE ("close_operation_id"),
  CONSTRAINT "external_driver_trips_fare_accrual_journal_key" UNIQUE ("fare_accrual_journal_entry_id"),
  CONSTRAINT "external_driver_trips_fare_payment_journal_key" UNIQUE ("fare_payment_journal_entry_id"),
  CONSTRAINT "external_driver_trips_fare_netting_journal_key" UNIQUE ("fare_netting_journal_entry_id"),
  CONSTRAINT "external_driver_trips_status_check" CHECK ("status" IN ('open','in_progress','closed')),
  CONSTRAINT "external_driver_trips_bearer_check" CHECK ("fare_bearer" IN ('store','customer_direct')),
  CONSTRAINT "external_driver_trips_method_check" CHECK ("fare_settlement_method" IN ('payable','cash_account','driver_keeps','customer_direct')),
  CONSTRAINT "external_driver_trips_values_check" CHECK (
    "fare_amount_iqd" >= 0
    AND ("expected_cash_iqd" IS NULL OR "expected_cash_iqd" >= 0)
    AND ("received_cash_iqd" IS NULL OR "received_cash_iqd" >= 0)
    AND ("netted_fare_iqd" IS NULL OR "netted_fare_iqd" >= 0)
  ),
  CONSTRAINT "external_driver_trips_driver_party_id_fkey" FOREIGN KEY ("driver_party_id") REFERENCES "delivery_parties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trips_fare_cash_account_id_fkey" FOREIGN KEY ("fare_cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trips_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trips_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trips_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trips_fare_accrual_journal_id_fkey" FOREIGN KEY ("fare_accrual_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trips_fare_payment_journal_id_fkey" FOREIGN KEY ("fare_payment_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trips_fare_netting_journal_id_fkey" FOREIGN KEY ("fare_netting_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "idx_external_driver_trips_driver_date" ON "external_driver_trips"("driver_party_id", "document_date" DESC, "id");
CREATE INDEX "idx_external_driver_trips_status_date" ON "external_driver_trips"("status", "document_date" DESC, "id");

CREATE TABLE "external_driver_trip_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trip_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "fare_share_iqd" DECIMAL(20,6) NOT NULL,
  "customer_acceptance_note" VARCHAR(500),
  "handed_over_by" UUID NOT NULL,
  "handed_over_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "external_driver_trip_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_driver_trip_orders_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "external_driver_trip_orders_values_check" CHECK ("fare_share_iqd" >= 0),
  CONSTRAINT "external_driver_trip_orders_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "external_driver_trips"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trip_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trip_orders_handed_over_by_fkey" FOREIGN KEY ("handed_over_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_external_driver_trip_orders_trip" ON "external_driver_trip_orders"("trip_id", "handed_over_at", "id");

CREATE TABLE "external_driver_trip_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trip_id" UUID NOT NULL,
  "order_id" UUID,
  "operation_id" VARCHAR(128) NOT NULL,
  "type" VARCHAR(32) NOT NULL,
  "source" VARCHAR(120) NOT NULL,
  "note" VARCHAR(500),
  "event_at" TIMESTAMPTZ(6) NOT NULL,
  "recorded_by" UUID NOT NULL,
  "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_driver_trip_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_driver_trip_events_operation_id_key" UNIQUE ("operation_id"),
  CONSTRAINT "external_driver_trip_events_type_check" CHECK ("type" IN ('handover','started','closed')),
  CONSTRAINT "external_driver_trip_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "external_driver_trips"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trip_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trip_events_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_external_driver_trip_events_trip" ON "external_driver_trip_events"("trip_id", "event_at", "id");

CREATE TABLE "external_driver_trip_settlement_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trip_id" UUID NOT NULL,
  "collection_id" UUID NOT NULL,
  "amount_iqd" DECIMAL(20,6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_driver_trip_settlement_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_driver_trip_settlement_allocations_trip_collection_key" UNIQUE ("trip_id", "collection_id"),
  CONSTRAINT "external_driver_trip_settlement_allocations_amount_check" CHECK ("amount_iqd" > 0),
  CONSTRAINT "external_driver_trip_settlement_allocations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "external_driver_trips"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "external_driver_trip_settlement_allocations_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "delivery_collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_external_driver_trip_settlement_allocations_collection" ON "external_driver_trip_settlement_allocations"("collection_id");

CREATE FUNCTION "reject_external_driver_trip_child_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'external driver trip child documents are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "external_driver_trip_orders_immutable_trigger" BEFORE UPDATE OR DELETE ON "external_driver_trip_orders" FOR EACH ROW EXECUTE FUNCTION "reject_external_driver_trip_child_mutation"();
CREATE TRIGGER "external_driver_trip_events_immutable_trigger" BEFORE UPDATE OR DELETE ON "external_driver_trip_events" FOR EACH ROW EXECUTE FUNCTION "reject_external_driver_trip_child_mutation"();
CREATE TRIGGER "external_driver_trip_settlement_allocations_immutable_trigger" BEFORE UPDATE OR DELETE ON "external_driver_trip_settlement_allocations" FOR EACH ROW EXECUTE FUNCTION "reject_external_driver_trip_child_mutation"();

INSERT INTO "permissions" ("key", "group", "description") VALUES
  ('trips.view', 'deliveries', 'View external driver trips'),
  ('trips.manage', 'deliveries', 'Create, hand over and start external driver trips'),
  ('trips.settle', 'deliveries', 'Close and settle external driver trips')
ON CONFLICT ("key") DO UPDATE SET "group"=EXCLUDED."group", "description"=EXCLUDED."description";

INSERT INTO "preset_permissions" ("preset_id", "permission_id")
SELECT preset."id", permission."id"
FROM "permission_presets" preset
CROSS JOIN "permissions" permission
WHERE (preset."name" IN ('super_admin', 'operations') AND permission."key" IN ('trips.view','trips.manage'))
   OR (preset."name" IN ('super_admin', 'cashier', 'accountant') AND permission."key" IN ('trips.view','trips.settle'))
ON CONFLICT ("preset_id", "permission_id") DO NOTHING;
