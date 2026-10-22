import assert from 'node:assert/strict';
import pg from 'pg';

if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'Section 29 release-gate acceptance requires an isolated *_verify database',
  );
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let assertions = 0;

function check(actual, expected, name) {
  assert.deepEqual(actual, expected, name);
  assertions += 1;
}

async function scalar(sql, params = []) {
  return (await db.query(sql, params)).rows[0]?.value;
}

try {
  check(
    Number(
      await scalar(`
        SELECT count(*)::int AS value
        FROM (
          SELECT entry.id
          FROM journal_entries entry
          LEFT JOIN journal_lines line ON line.entry_id=entry.id
          GROUP BY entry.id
          HAVING coalesce(sum(line.debit_base), 0)
            <> coalesce(sum(line.credit_base), 0)
        ) unbalanced
      `),
    ),
    0,
    'S29-GLOBAL-LEDGER: every posted journal balances exactly',
  );
  check(
    Number(
      await scalar(`
        SELECT count(*)::int AS value
        FROM batch_stock
        WHERE quantity < 0 OR reserved < 0 OR reserved > quantity
      `),
    ),
    0,
    'S29-GLOBAL-STOCK: no negative or phantom reservation survives',
  );
  check(
    Number(
      await scalar(`
        SELECT count(*)::int AS value
        FROM sku_costs
        WHERE book_quantity < 0 OR book_value_iqd < 0 OR average_cost_iqd < 0
      `),
    ),
    0,
    'S29-GLOBAL-STOCK: SKU quantities and values remain non-negative',
  );

  const movingAverage = (
    await db.query(`
      SELECT cost.book_quantity::numeric, cost.book_value_iqd::numeric,
             cost.average_cost_iqd::numeric
      FROM sku_costs cost
      JOIN product_variants variant ON variant.id=cost.variant_id
      WHERE variant.sku LIKE 'P5-COST-%'
      ORDER BY variant.sku DESC
      LIMIT 1
    `)
  ).rows[0];
  check(
    movingAverage && [
      Number(movingAverage.book_quantity),
      Number(movingAverage.book_value_iqd),
      Number(movingAverage.average_cost_iqd),
    ],
    [17, 187000, 11000],
    'S29-WORKED-12.5: 20 units at 220,000 less a 33,000 issue leave 17 / 187,000 / 11,000',
  );
  check(
    (
      await db.query(`
        SELECT batch.purchase_cost::numeric
        FROM inventory_batches batch
        JOIN product_variants variant ON variant.id=batch.variant_id
        WHERE variant.sku LIKE 'P5-COST-%'
        ORDER BY batch.purchase_cost
      `)
    ).rows.map((row) => Number(row.purchase_cost)),
    [10000, 12000],
    'S29-WORKED-12.5: the original 10,000 and 12,000 lot costs remain immutable',
  );

  const rent = (
    await db.query(`
      SELECT expense.amount_iqd::numeric, expense.paid_currency::numeric,
             expense.balance_currency::numeric, count(payment.id)::int AS payments
      FROM expenses expense
      LEFT JOIN expense_payments payment ON payment.expense_id=expense.id
      WHERE expense.reference_number='SECTION29-RENT-300000'
      GROUP BY expense.id
    `)
  ).rows[0];
  check(
    rent && [
      Number(rent.amount_iqd),
      Number(rent.paid_currency),
      Number(rent.balance_currency),
      Number(rent.payments),
    ],
    [300000, 300000, 0, 2],
    'S29-WORKED-17.2: 300,000 rent paid 100,000 then 200,000 is expensed once and settled in two payments',
  );

  check(
    Number(
      await scalar(`
        SELECT count(*)::int AS value
        FROM return_items item
        JOIN order_items ordered ON ordered.id=item.order_item_id
        WHERE ordered.quantity=2 AND ordered.net_paid_total=18000
          AND item.approved_quantity=1 AND item.approved_refund=9000
      `),
    ),
    1,
    'S29-WORKED-16.3: one of two discounted units has one immutable 9,000 refund share',
  );
  check(
    Number(
      await scalar(`
        SELECT count(*)::int AS value
        FROM (
          SELECT ordered.id
          FROM order_items ordered
          LEFT JOIN return_items returned ON returned.order_item_id=ordered.id
          GROUP BY ordered.id
          HAVING coalesce(sum(returned.approved_refund),0) > ordered.net_paid_total
        ) over_refunded
      `),
    ),
    0,
    'S29-GLOBAL-RETURNS: successive returns never exceed stored net-paid totals',
  );

  check(
    Number(
      await scalar(`
        SELECT count(*)::int AS value
        FROM (
          SELECT user_id, operation_id
          FROM operation_records
          GROUP BY user_id, operation_id
          HAVING count(*) > 1
        ) duplicated
      `),
    ),
    0,
    'S29-GLOBAL-IDEMPOTENCY: no user operation outcome is duplicated',
  );

  console.log(
    `Section 29 release-gate acceptance: ${assertions} assertions passed`,
  );
} finally {
  await db.end();
}
