CREATE TABLE "cart_mutations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_mutations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cart_mutations_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "cart_mutations_cart_key_key" ON "cart_mutations"("cart_id", "idempotency_key");
CREATE INDEX "idx_cart_mutations_created" ON "cart_mutations"("created_at");
