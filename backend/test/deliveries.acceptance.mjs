import assert from 'node:assert/strict';

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
    expected: 201,
  });
  check(challenge.dev_otp, process.env.DEV_OTP ?? '000000', 'development OTP');
  return request('/auth/verify-otp', {
    method: 'POST',
    body: { phone, code: challenge.dev_otp },
    expected: 201,
  });
}

function adminLogin() {
  return request('/admin/auth/login', {
    method: 'POST', body: { username: 'admin', password: 'Shubayr-Dev-Admin!2026' }, expected: 201,
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
  body: { status: 'out_for_delivery' },
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
  body: { status: 'delivered' },
  expected: 409,
});
const dispatched = await request(`/deliveries/${assigned.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: { status: 'out_for_delivery' },
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
  body: { status: 'delivered' },
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
  body: { status: 'returned' },
});
check(returned.status, 'returned', 'delivered delivery may be returned');
check(
  (await request(`/orders/${assigned.id}`, { token: token(customer) })).status,
  'returned',
  'return advances order',
);
await request(`/deliveries/${assigned.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: { status: 'delivered' },
  expected: 409,
});

await request(`/deliveries/${second.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: { status: 'out_for_delivery' },
});
const failed = await request(`/deliveries/${second.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: { status: 'failed' },
});
check(failed.status, 'failed', 'failed is terminal alternate');
check(
  (await request(`/orders/${second.id}`, { token: token(customer) })).status,
  'failed',
  'failure advances order',
);
await request(`/deliveries/${second.delivery_id}`, {
  token: token(agentA),
  method: 'PATCH',
  body: { status: 'delivered' },
  expected: 409,
});
console.log(`Delivery acceptance passed (${assertions} assertions).`);
