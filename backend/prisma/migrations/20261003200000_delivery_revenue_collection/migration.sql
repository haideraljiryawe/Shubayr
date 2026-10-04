-- Phase 8b: record delivery revenue and COD collection custody separately.

CREATE TABLE "delivery_collections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "delivery_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "party_id" UUID NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "due_amount" DECIMAL(20,6) NOT NULL,
  "collected_amount" DECIMAL(20,6),
  "shortfall_amount" DECIMAL(20,6),
  "currency_code" CHAR(3) NOT NULL DEFAULT 'IQD',
  "delivered_operation_id" VARCHAR(128) NOT NULL,
  "delivered_by" UUID NOT NULL,
  "delivered_at" TIMESTAMPTZ(6) NOT NULL,
  "accounting_date" DATE NOT NULL,
  "delivery_journal_entry_id" UUID NOT NULL,
  "confirmed_operation_id" VARCHAR(128),
  "confirmed_by" UUID,
  "confirmed_at" TIMESTAMPTZ(6),
  "confirmation_journal_entry_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_collections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_collections_delivery_id_key" UNIQUE ("delivery_id"),
  CONSTRAINT "delivery_collections_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "delivery_collections_delivery_journal_key" UNIQUE ("delivery_journal_entry_id"),
  CONSTRAINT "delivery_collections_confirmation_journal_key" UNIQUE ("confirmation_journal_entry_id"),
  CONSTRAINT "delivery_collections_status_check" CHECK ("status" IN ('confirmed_full', 'confirmed_short', 'unconfirmed')),
  CONSTRAINT "delivery_collections_amounts_check" CHECK (
    "due_amount" >= 0 AND
    ("collected_amount" IS NULL OR "collected_amount" >= 0) AND
    ("shortfall_amount" IS NULL OR "shortfall_amount" >= 0) AND
    (("status" = 'unconfirmed' AND "collected_amount" IS NULL AND "shortfall_amount" IS NULL AND "confirmed_at" IS NULL) OR
     ("status" = 'confirmed_full' AND "collected_amount" = "due_amount" AND "shortfall_amount" = 0) OR
     ("status" = 'confirmed_short' AND "collected_amount" < "due_amount" AND "shortfall_amount" = "due_amount" - "collected_amount"))
  ),
  CONSTRAINT "delivery_collections_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE NO ACTION,
  CONSTRAINT "delivery_collections_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION,
  CONSTRAINT "delivery_collections_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "delivery_parties"("id") ON DELETE NO ACTION,
  CONSTRAINT "delivery_collections_delivery_journal_fkey" FOREIGN KEY ("delivery_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION,
  CONSTRAINT "delivery_collections_confirmation_journal_fkey" FOREIGN KEY ("confirmation_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION
);

CREATE INDEX "idx_delivery_collections_status_time"
  ON "delivery_collections"("status", "delivered_at" DESC, "id");
CREATE INDEX "idx_delivery_collections_party_status_time"
  ON "delivery_collections"("party_id", "status", "delivered_at");
