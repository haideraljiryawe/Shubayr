import assert from 'node:assert/strict';
import pg from 'pg';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'Run acceptance through npm run test:acceptance (isolated *_verify database required)',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1' || !new URL(api).port) {
  throw new Error('Acceptance requires the runner-owned loopback API URL');
}
let assertions = 0;
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

async function request(
  path,
  { token, method = 'GET', body, expected = 200 } = {},
) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  check(response.status, expected, `${method} ${path}: ${text}`);
  return payload;
}

async function login(phone) {
  const challenge = await request('/auth/request-otp', {
    method: 'POST',
    body: { phone },
    expected: 200,
  });
  check(challenge.dev_otp, process.env.DEV_OTP ?? '000000', 'development OTP');
  return request('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: challenge.dev_otp },
    expected: 200,
  });
}

function adminLogin() {
  return request('/admin/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' },
    expected: 201,
  });
}

const [admin, agentA, agentB, customer, otherCustomer] = await Promise.all([
  adminLogin(),
  login('+9647700000005'),
  login('+9647700000007'),
  login('+9647700000006'),
  login('+9647700099999'),
]);
const token = (session) => session.access_token;
const orders = await request('/orders?per_page=100', {
  token: token(customer),
});
const sample = (number) =>
  orders.data.find((order) => order.order_number === `DEV-ORDER-${number}`);
const assigned = sample(6);
const second = sample(7);
const alreadyDelivered = sample(4);
assert.ok(
  assigned?.delivery_id && second?.delivery_id && alreadyDelivered?.delivery_id,
);
assertions += 1;

const all = await request('/deliveries?per_page=100', { token: token(admin) });
check(
  all.data.some((delivery) => delivery.id === assigned.delivery_id),
  true,
  'staff sees all deliveries',
);
check(
  all.data.some((delivery) => delivery.id === second.delivery_id),
  true,
  'staff sees other agent',
);
await request('/deliveries', { token: token(agentA), expected: 403 });
const ownA = await request('/deliveries/assigned?per_page=100', {
  token: token(agentA),
});
const ownB = await request('/deliveries/assigned?per_page=100', {
  token: token(agentB),
});
check(
  ownA.data.some((delivery) => delivery.id === second.delivery_id),
  false,
  'agent A cannot list B delivery',
);
check(
  ownB.data.some((delivery) => delivery.id === second.delivery_id),
  true,
  'agent B lists assigned delivery',
);
await request(`/deliveries/${second.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: { status: 'out_for_delivery', order_version: second.version },
  expected: 403,
});
await request(`/deliveries/${second.delivery_id}/assign`, {
  token: token(agentA),
  method: 'PATCH',
  body: { agent_id: agentA.user.id },
  expected: 403,
});
const reassigned = await request(`/deliveries/${second.delivery_id}/assign`, {
  token: token(admin),
  method: 'PATCH',
  body: { agent_id: agentA.user.id },
});
check(reassigned.agent_id, agentA.user.id, 'staff reassigns active delivery');
const formerB = await request('/deliveries/assigned?per_page=100', {
  token: token(agentB),
});
check(
  formerB.data.some((delivery) => delivery.id === second.delivery_id),
  false,
  'reassignment revokes B access',
);

await request(`/deliveries/${assigned.delivery_id}/rating`, {
  token: token(customer),
  method: 'POST',
  body: { stars: 4 },
  expected: 409,
});
await request(`/deliveries/${alreadyDelivered.delivery_id}/rating`, {
  token: token(otherCustomer),
  method: 'POST',
  body: { stars: 5 },
  expected: 404,
});
await request(`/deliveries/${assigned.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: {
    status: 'delivered',
    order_version: assigned.version,
    operation_id: 'delivery-invalid-before-dispatch',
    collection_confirmation: 'unconfirmed',
  },
  expected: 409,
});
const dispatched = await request(`/deliveries/${assigned.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: { status: 'out_for_delivery', order_version: assigned.version },
});
check(dispatched.status, 'out_for_delivery', 'legal dispatch transition');
check(Boolean(dispatched.dispatched_at), true, 'dispatch timestamp stamped');
const afterDispatch = await request(`/orders/${assigned.id}`, {
  token: token(customer),
});
check(afterDispatch.status, 'dispatched', 'dispatch advances parent order');
const delivered = await request(`/deliveries/${assigned.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: {
    status: 'delivered',
    order_version: afterDispatch.version,
    operation_id: 'delivery-assigned-full',
    collection_confirmation: 'confirmed',
    collected_amount: String(assigned.total),
  },
});
check(delivered.status, 'delivered', 'legal delivered transition');
check(Boolean(delivered.delivered_at), true, 'delivery timestamp stamped');
const afterDelivery = await request(`/orders/${assigned.id}`, {
  token: token(customer),
});
check(afterDelivery.status, 'delivered', 'delivery advances parent order');
const track = await request(`/orders/${assigned.id}/track`, {
  token: token(customer),
});
check(
  track.events.at(-1).status,
  'delivered',
  'tracking receives delivered event',
);
const rating = await request(`/deliveries/${assigned.delivery_id}/rating`, {
  token: token(customer),
  method: 'POST',
  body: { stars: 4, comment: 'On time' },
  expected: 201,
});
check(rating.stars, 4, 'delivery rating stored separately');
check(rating.agent_id, agentA.user.id, 'rating snapshots assigned agent');
await request(`/deliveries/${assigned.delivery_id}/rating`, {
  token: token(customer),
  method: 'POST',
  body: { stars: 5 },
  expected: 409,
});
await request(`/deliveries/${alreadyDelivered.delivery_id}/rating`, {
  token: token(customer),
  method: 'POST',
  body: { stars: 5 },
  expected: 409,
});
const returned = await request(`/deliveries/${assigned.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: { status: 'returned', order_version: afterDelivery.version },
});
check(returned.status, 'returned', 'delivered delivery may be returned');
const afterReturn = await request(`/orders/${assigned.id}`, {
  token: token(customer),
});
check(afterReturn.status, 'returned', 'return advances order');
await request(`/deliveries/${assigned.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: {
    status: 'delivered',
    order_version: afterReturn.version,
    operation_id: 'delivery-invalid-after-return',
    collection_confirmation: 'unconfirmed',
  },
  expected: 409,
});

await request(`/deliveries/${second.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: { status: 'out_for_delivery', order_version: second.version },
});
const secondDispatched = await request(`/orders/${second.id}`, {
  token: token(customer),
});
const failed = await request(`/deliveries/${second.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: {
    status: 'failed',
    order_version: secondDispatched.version,
    reason: 'Recipient unavailable',
  },
});
check(failed.status, 'failed', 'failed is terminal alternate');
check(failed.attempts.length, 1, 'first delivery attempt is retained');
check(
  {
    number: failed.attempts[0].attempt_number,
    status: failed.attempts[0].status,
    reason: failed.attempts[0].reason,
    party: failed.attempts[0].party.id,
    completed: Boolean(failed.attempts[0].completed_at),
  },
  {
    number: 1,
    status: 'failed',
    reason: 'Recipient unavailable',
    party: agentA.user.id,
    completed: true,
  },
  'failure history records reason, party and completion time',
);
const secondFailed = await request(`/orders/${second.id}`, {
  token: token(customer),
});
check(secondFailed.status, 'failed', 'failure advances order');
check(
  secondFailed.delivery_attempts[0].reason,
  'Recipient unavailable',
  'customer can read the failed-attempt reason',
);
await request(`/deliveries/${second.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: {
    status: 'delivered',
    order_version: secondFailed.version,
    operation_id: 'delivery-invalid-after-failure',
    collection_confirmation: 'unconfirmed',
  },
  expected: 409,
});

const issueCount = async () =>
  Number(
    (
      await db.query(
        `SELECT count(*)::int AS value
         FROM stock_movements
         WHERE source_type='order' AND source_id=$1 AND type='issue_to_custody'`,
        [second.id],
      )
    ).rows[0].value,
  );
const issuesBeforeRetry = await issueCount();
const retried = await request(
  `/admin/deliveries/${second.delivery_id}/status`,
  {
    token: token(admin),
    method: 'PATCH',
    body: {
      status: 'out_for_delivery',
      order_version: secondFailed.version,
    },
  },
);
check(retried.status, 'out_for_delivery', 'authorized staff retries failure');
check(retried.attempts.length, 2, 'retry appends a second attempt');
check(
  retried.attempts[0].reason,
  'Recipient unavailable',
  'retry does not erase the first failure reason',
);
check(
  retried.attempts[1].status,
  'out_for_delivery',
  'retry starts a new open attempt',
);
check(
  await issueCount(),
  issuesBeforeRetry,
  'failed delivery retry does not issue stock a second time',
);
const retryDispatched = await request(`/orders/${second.id}`, {
  token: token(customer),
});
await request(`/admin/deliveries/${second.delivery_id}/status`, {
  token: token(admin),
  method: 'PATCH',
  body: {
    status: 'failed',
    order_version: retryDispatched.version,
    reason: 'Second attempt failed',
  },
});
const failedAgain = await request(`/orders/${second.id}`, {
  token: token(customer),
});
check(failedAgain.status, 'failed', 'staff failure permission advances order');
check(
  failedAgain.delivery_attempts.map(({ reason }) => reason),
  ['Recipient unavailable', 'Second attempt failed'],
  'customer order history retains both delivery failures',
);
const staffAttemptHistory = await request(`/admin/orders/${second.id}`, {
  token: token(admin),
});
check(
  staffAttemptHistory.delivery_attempts.map(({ reason }) => reason),
  ['Recipient unavailable', 'Second attempt failed'],
  'staff can read every delivery attempt',
);
const agentAttemptHistory = await request(
  '/deliveries/assigned?status=failed&per_page=100',
  { token: token(agentA) },
);
check(
  agentAttemptHistory.data
    .find(({ id }) => id === second.delivery_id)
    .attempts.map(({ reason }) => reason),
  ['Recipient unavailable', 'Second attempt failed'],
  'assigned agent can read every delivery attempt',
);

const retrieval = await request(`/admin/orders/${second.id}/retrievals`, {
  token: token(admin),
  method: 'POST',
  expected: 201,
  body: {
    operation_id: `retry-open-${Date.now()}`,
    outcome: 'retry',
    reason: 'Return to warehouse before reassignment',
  },
});
check(retrieval.status, 'open', 'failed order opens retrieval document');
check(retrieval.lines.length > 0, true, 'retrieval snapshots custody lines');
const retrievals = await request(
  `/admin/retrievals?party_id=${agentA.user.id}&order_id=${second.id}&status=open&from=${retrieval.document_date}&to=${retrieval.document_date}`,
  { token: token(admin) },
);
check(retrievals.total, 1, 'retrieval list applies all filters');
check(
  {
    id: retrievals.data[0].id,
    party: retrievals.data[0].custody_party.id,
    order: retrievals.data[0].order.id,
    lines: retrievals.data[0].line_count,
  },
  {
    id: retrieval.id,
    party: agentA.user.id,
    order: second.id,
    lines: retrieval.lines.length,
  },
  'retrieval list exposes its order, party and line count',
);
const warehouses = await request('/admin/inventory/warehouses', {
  token: token(admin),
});
const location = warehouses
  .flatMap((warehouse) => warehouse.locations)
  .find((entry) => entry.is_active && entry.is_sellable);
assert.ok(location, 'an active sellable retrieval location must exist');
assertions += 1;
const line = retrieval.lines[0];
const expectedQuantity = Number(line.expected_quantity);
const partialQuantity = expectedQuantity / 2;
await request(`/admin/retrievals/${retrieval.id}/receive`, {
  token: token(admin),
  method: 'POST',
  expected: 409,
  body: {
    operation_id: `retry-over-${Date.now()}`,
    lines: [
      {
        line_id: line.id,
        location_id: location.id,
        quantity: String(expectedQuantity + 1),
      },
    ],
  },
});
const partial = await request(`/admin/retrievals/${retrieval.id}/receive`, {
  token: token(admin),
  method: 'POST',
  body: {
    operation_id: `retry-partial-${Date.now()}`,
    lines: [
      {
        line_id: line.id,
        location_id: location.id,
        quantity: String(partialQuantity),
      },
    ],
  },
});
check(partial.status, 'partially_received', 'partial retrieval remains open');
const closed = await request(`/admin/retrievals/${retrieval.id}/receive`, {
  token: token(admin),
  method: 'POST',
  body: {
    operation_id: `retry-close-${Date.now()}`,
    lines: [
      {
        line_id: line.id,
        location_id: location.id,
        quantity: String(expectedQuantity - partialQuantity),
      },
    ],
  },
});
check(closed.status, 'closed', 'full receipt closes retrieval');
check(
  Number(
    (
      await db.query(
        `SELECT coalesce(sum(remaining_quantity), 0)::numeric AS value
         FROM custody_holdings WHERE order_id=$1`,
        [second.id],
      )
    ).rows[0].value,
  ),
  0,
  'retrieval clears delivery custody',
);
const retryReady = await request(`/orders/${second.id}`, {
  token: token(customer),
});
check(
  retryReady.status,
  'ready_for_dispatch',
  'closed retry retrieval returns order to dispatch preparation',
);
const journalBalance = await db.query(
  `SELECT coalesce(sum(l.debit_base), 0)::numeric AS debit,
          coalesce(sum(l.credit_base), 0)::numeric AS credit
   FROM journal_entries e
   JOIN journal_lines l ON l.entry_id=e.id
   WHERE e.source_type='retrieval' AND e.source_id=$1`,
  [retrieval.id],
);
check(
  Number(journalBalance.rows[0].debit),
  Number(journalBalance.rows[0].credit),
  'partial retrieval postings stay balanced at original issue cost',
);
await db.end();
console.log(`Delivery acceptance passed (${assertions} assertions).`);
