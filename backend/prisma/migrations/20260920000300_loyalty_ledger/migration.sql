-- Preserve any legacy cached balance before removing the mutable column.
ALTER TABLE "loyalty_ledger"
  ADD COLUMN "return_id" UUID,
  ADD COLUMN "reason" VARCHAR(120),
  ADD COLUMN "created_by" UUID;

UPDATE "loyalty_ledger" AS entry
SET "reason" = COALESCE(NULLIF(entry."note", ''), entry."type"),
    "created_by" = account."user_id"
FROM "loyalty_accounts" AS account
WHERE entry."account_id" = account."id";

ALTER TABLE "loyalty_ledger"
  ALTER COLUMN "reason" SET NOT NULL,
  ALTER COLUMN "created_by" SET NOT NULL;

INSERT INTO "loyalty_ledger" ("account_id", "type", "reason", "points", "note", "created_by")
SELECT account."id", 'adjust', 'legacy_balance_reconciliation',
       account."points_balance" - COALESCE(totals."points", 0),
       'Migrated legacy cached balance into the append-only ledger', account."user_id"
FROM "loyalty_accounts" AS account
LEFT JOIN (
  SELECT "account_id", SUM("points") AS "points"
  FROM "loyalty_ledger" GROUP BY "account_id"
) AS totals ON totals."account_id" = account."id"
WHERE account."points_balance" <> COALESCE(totals."points", 0);

INSERT INTO "audit_logs" ("actor_id", "action", "entity_type", "entity_id", "after")
SELECT entry."created_by", 'loyalty.adjust', 'loyalty_ledger', entry."id",
       jsonb_build_object('reason', entry."reason", 'points', entry."points")
FROM "loyalty_ledger" AS entry
WHERE entry."reason" = 'legacy_balance_reconciliation';

ALTER TABLE "loyalty_accounts" DROP COLUMN "points_balance";

ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_return_id_fkey"
  FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "idx_loyalty_ledger_return" ON "loyalty_ledger"("return_id");
CREATE UNIQUE INDEX "loyalty_earn_order_once"
  ON "loyalty_ledger"("order_id") WHERE "type" = 'earn';
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_type_points_check"
  CHECK (("type" = 'earn' AND "points" > 0 AND "order_id" IS NOT NULL)
      OR ("type" = 'redeem' AND "points" < 0)
      OR ("type" = 'adjust' AND "points" <> 0)
      OR ("type" = 'expire' AND "points" < 0));

-- Ledger rows are immutable, including when a parent row is deleted.
CREATE FUNCTION loyalty_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'loyalty ledger entries are append-only';
END;
$$;
CREATE TRIGGER loyalty_ledger_no_update_delete
  BEFORE UPDATE OR DELETE ON "loyalty_ledger"
  FOR EACH ROW EXECUTE FUNCTION loyalty_ledger_immutable();

ALTER TABLE "products" ADD CONSTRAINT "products_negotiation_values_check"
  CHECK (("floor_price" IS NULL OR ("floor_price" >= 0 AND "floor_price" <= "price"))
      AND ("points_price" IS NULL OR "points_price" >= 0));
