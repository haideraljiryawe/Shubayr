import assert from 'node:assert/strict';

const api = process.env.ACCEPTANCE_API_URL?.replace(/\/$/, '');
if (
  !/^shubayr_[a-f0-9]{16}_verify$/.test(
    process.env.ACCEPTANCE_DATABASE_NAME ?? '',
  )
) {
  throw new Error(
    'Access-model acceptance requires the disposable *_verify database',
  );
}
if (!api || new URL(api).hostname !== '127.0.0.1') {
  throw new Error(
    'Access-model acceptance requires the runner-owned loopback API',
  );
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

async function otpLogin(phone, extra = {}) {
  const challenge = await request('/auth/request-otp', {
    method: 'POST',
    expected: 200,
    body: { phone },
  });
  return request('/auth/verify-otp', {
    method: 'POST',
    expected: 200,
    body: { phone, code: challenge.dev_otp, client: 'mobile', ...extra },
  });
}

function adminLogin(username, password, expected = 201) {
  return request('/admin/auth/login', {
    method: 'POST',
    expected,
    body: { username, password },
  });
}

const adminSession = await adminLogin('admin', 'Shubayr-Dev-Admin!2026');
check(
  adminSession.user.surface,
  'admin',
  'password login creates an admin session',
);
const refreshedAdmin = await request('/auth/refresh', {
  method: 'POST',
  expected: 200,
  body: { refresh_token: adminSession.refresh_token },
});
const admin = refreshedAdmin.access_token;
await request('/admin/staff', { token: admin });

// The same database user has a customer phone, but its app token has no admin grants.
const adminApp = await otpLogin('+9647700000001');
check(adminApp.user.surface, 'app', 'OTP always creates an app session');
check(adminApp.user.role, 'customer', 'the server resolves the phone role');
check(
  adminApp.user.permissions,
  [],
  'app sessions never inherit admin permissions',
);
const refreshedApp = await request('/auth/refresh', {
  method: 'POST',
  expected: 200,
  body: { refresh_token: adminApp.refresh_token },
});
const forged = await request('/admin/staff', {
  token: refreshedApp.access_token,
  expected: 403,
});
check(forged.code, 'AUTH_SURFACE_FORBIDDEN', 'app token cannot call admin API');
await request('/auth/logout', {
  method: 'POST',
  expected: 201,
  body: { refresh_token: refreshedApp.refresh_token },
});
await request('/auth/refresh', {
  method: 'POST',
  expected: 401,
  body: { refresh_token: refreshedApp.refresh_token },
});

// Unknown callers cannot choose their role in the OTP payload.
const rolePhone = '+9647700888801';
const roleChallenge = await request('/auth/request-otp', {
  method: 'POST',
  expected: 200,
  body: { phone: rolePhone },
});
await request('/auth/verify-otp', {
  method: 'POST',
  expected: 422,
  body: {
    phone: rolePhone,
    code: roleChallenge.dev_otp,
    role: 'delivery_agent',
  },
});

// An existing customer phone cannot be converted to a work phone.
const conflict = await request('/admin/work-phones', {
  token: admin,
  method: 'POST',
  expected: 409,
  body: {
    phone: '+9647700000006',
    name: 'Existing customer',
    role: 'delivery_agent',
    reason: 'Acceptance conflict check',
  },
});
check(
  conflict.code,
  'CUSTOMER_PHONE_ALREADY_REGISTERED',
  'customer conversion has a stable error code',
);

const delivery = await otpLogin('+9647700000005');
const monitor = await otpLogin('+9647700000008');
const monitoredOrders = await request('/monitor/orders?per_page=2', {
  token: monitor.access_token,
});
check(
  monitoredOrders.data.length > 0,
  true,
  'order monitor can read the order list',
);
await request(`/monitor/orders/${monitoredOrders.data[0].id}`, {
  token: monitor.access_token,
});

const shoppingRoutes = [
  ['GET', '/cart'],
  [
    'POST',
    '/cart/items',
    { product_id: '40000000-0000-4000-8000-000000000001', quantity: 1 },
  ],
  ['GET', '/wishlist'],
  ['POST', '/wishlist', { product_id: '40000000-0000-4000-8000-000000000001' }],
  ['GET', '/addresses'],
  ['POST', '/addresses', { city: 'Baghdad', contact_phone: '+9647700000005' }],
  ['POST', '/orders', { address_id: '10000000-0000-4000-8000-000000000001' }],
  [
    'POST',
    '/returns',
    { order_id: '10000000-0000-4000-8000-000000000001', items: [] },
  ],
  ['GET', '/loyalty'],
  ['POST', '/loyalty/redeem', { points: 1 }],
  ['GET', '/me/reviews'],
  [
    'POST',
    '/products/40000000-0000-4000-8000-000000000001/reviews',
    { order_item_id: '10000000-0000-4000-8000-000000000001', rating: 5 },
  ],
];
for (const session of [delivery, monitor]) {
  for (const [method, path, body] of shoppingRoutes) {
    const denied = await request(path, {
      token: session.access_token,
      method,
      body,
      expected: 403,
    });
    check(
      denied.code,
      'WORK_ACCOUNT_SHOPPING_FORBIDDEN',
      `${session.user.role} cannot shop at ${path}`,
    );
  }
}

// Permission changes are read using the current version on the very next request.
const suffix = Date.now().toString(36);
const username = `verify_${suffix}`;
const temporaryPassword = 'Temporary-Access!2026';
const newPassword = 'Changed-Access!2026';
const staff = await request('/admin/staff', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: {
    username,
    name: 'Permission Verify',
    password: temporaryPassword,
    reason: 'Acceptance permission version test',
  },
});
const initialStaffLogin = await adminLogin(username, temporaryPassword);
const changed = await request('/admin/auth/change-password', {
  token: initialStaffLogin.access_token,
  method: 'POST',
  expected: 201,
  body: { current_password: temporaryPassword, new_password: newPassword },
});
const stableToken = changed.access_token;
await request('/admin/orders', { token: stableToken, expected: 403 });
await request(`/admin/staff/${staff.id}/access`, {
  token: admin,
  method: 'PUT',
  body: {
    preset_ids: [],
    permission_keys: ['orders.view'],
    reason: 'Grant for next-request test',
  },
});
await request('/admin/orders?per_page=1', { token: stableToken });
await request(`/admin/staff/${staff.id}/access`, {
  token: admin,
  method: 'PUT',
  body: {
    preset_ids: [],
    permission_keys: [],
    reason: 'Revoke for next-request test',
  },
});
await request('/admin/orders', { token: stableToken, expected: 403 });

// Deactivation invalidates the already-issued access token.
await request(`/admin/staff/${staff.id}`, {
  token: admin,
  method: 'PATCH',
  body: { is_active: false, reason: 'Acceptance session revocation test' },
});
await request('/me', { token: stableToken, expected: 401 });

// Password reset forces a change before any other admin action.
const resetName = `reset_${suffix}`;
const resetStaff = await request('/admin/staff', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: {
    username: resetName,
    name: 'Password Reset Verify',
    password: temporaryPassword,
    permission_keys: ['orders.view'],
    reason: 'Acceptance password reset test',
  },
});
const resetLogin = await adminLogin(resetName, temporaryPassword);
const forced = await request('/admin/orders', {
  token: resetLogin.access_token,
  expected: 403,
});
check(
  forced.code,
  'PASSWORD_CHANGE_REQUIRED',
  'temporary password gates other admin routes',
);
const resetChanged = await request('/admin/auth/change-password', {
  token: resetLogin.access_token,
  method: 'POST',
  expected: 201,
  body: {
    current_password: temporaryPassword,
    new_password: 'Reset-Changed!2026',
  },
});
await request('/admin/orders?per_page=1', { token: resetChanged.access_token });

// Five failures lock the account; the correct password is then rate/lock denied.
const lockName = `lock_${suffix}`;
await request('/admin/staff', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: {
    username: lockName,
    name: 'Lockout Verify',
    password: temporaryPassword,
    reason: 'Acceptance lockout test',
  },
});
for (let attempt = 0; attempt < 5; attempt += 1) {
  await adminLogin(lockName, 'Wrong-Password!2026', 401);
}
const locked = await adminLogin(lockName, temporaryPassword, 429);
check(locked.code, 'ACCOUNT_LOCKED', 'repeated failures lock the account');

// Work-role revocation kills an existing app session on its next request.
const workPhone = '+9647700888802';
await request('/admin/work-phones', {
  token: admin,
  method: 'POST',
  expected: 201,
  body: {
    phone: workPhone,
    name: 'Revocation Verify',
    role: 'order_monitor',
    reason: 'Acceptance role revocation test',
  },
});
const work = await otpLogin(workPhone);
await request('/monitor/orders?per_page=1', { token: work.access_token });
await request(
  `/admin/work-phones/${encodeURIComponent(workPhone)}?reason=${encodeURIComponent('Acceptance role revocation test')}`,
  {
    token: admin,
    method: 'DELETE',
    expected: 204,
  },
);
await request('/me', { token: work.access_token, expected: 401 });

console.log(`Access-model acceptance assertions: ${assertions}`);
