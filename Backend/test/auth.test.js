const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { createAuthService } = require('../src/services/auth-service');

const JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';
const users = [];
const logs = [];

function query(value) {
  return {
    select() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}

const User = {
  findOne({ $or: conditions }) {
    return query(users.find((user) => conditions.some((condition) => (
      user.username === condition.username || user.email === condition.email
    ))) || null);
  },
  findById(id) {
    return Promise.resolve(users.find((user) => user._id === String(id)) || null);
  },
  find() {
    return {
      sort: () => Promise.resolve(users),
    };
  },
  async findByIdAndUpdate(id, update) {
    const user = users.find((item) => item._id === String(id));
    if (!user) return null;
    if (update.$inc) {
      for (const [key, increment] of Object.entries(update.$inc)) {
        user[key] = (user[key] || 0) + increment;
      }
    }
    if (update.$set) Object.assign(user, update.$set);
    return user;
  },
  async create(record) {
    const user = {
      _id: `created-${users.length}`,
      ...record,
      isActive: record.isActive !== false,
      tokenVersion: 0,
    };
    users.push(user);
    return user;
  },
};

const SystemLog = {
  async create(entry) {
    logs.push(entry);
    return entry;
  },
};

let server;
let apiUrl;

async function addUser(_id, username, email, role, isActive = true) {
  users.push({
    _id,
    username,
    email,
    role,
    isActive,
    tokenVersion: 0,
    passwordHash: await bcrypt.hash('correct horse battery staple', 4),
  });
}

async function request(path, options = {}) {
  return fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

before(async () => {
  users.length = 0;
  logs.length = 0;
  await addUser('admin-1', 'wetzy-admin', 'admin@example.com', 'admin');
  await addUser('super-1', 'wetzy-super', 'super@example.com', 'superadmin');
  await addUser('user-1', 'regular-user', 'user@example.com', 'user');
  await addUser('inactive-1', 'inactive-admin', 'inactive@example.com', 'admin', false);

  const authService = createAuthService({ jwtSecret: JWT_SECRET }, { User, SystemLog });
  server = http.createServer(createApp({
    corsOrigins: ['*'],
    jwtSecret: JWT_SECRET,
    mlServiceUrl: 'http://127.0.0.1:1',
    mlServiceTimeoutMs: 100,
  }, { authService }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  apiUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test('active admin and superadmin accounts can sign in by username or email', async () => {
  for (const [identifier, expectedRole] of [
    ['WETZY-ADMIN', 'admin'],
    ['super@example.com', 'superadmin'],
  ]) {
    const response = await request('/api/auth/staff/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password: 'correct horse battery staple' }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.user.role, expectedRole);
    assert.equal('passwordHash' in body.user, false);
    assert.equal(typeof body.token, 'string');

    const profile = await request('/api/auth/staff/me', {
      headers: { authorization: `Bearer ${body.token}` },
    });
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).user.role, expectedRole);
  }
});

test('invalid, inactive, and non-staff accounts receive the same login error', async () => {
  const attempts = [
    { identifier: 'unknown', password: 'anything' },
    { identifier: 'user@example.com', password: 'correct horse battery staple' },
    { identifier: 'inactive-admin', password: 'correct horse battery staple' },
    { identifier: 'wetzy-admin', password: 'incorrect password' },
  ];
  const responses = [];

  for (const body of attempts) {
    const response = await request('/api/auth/staff/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    responses.push({ status: response.status, body: await response.json() });
  }

  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.deepEqual(response.body.error, {
      code: 'INVALID_CREDENTIALS',
      message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    });
  }
});

test('logout invalidates the session token and writes a log without credentials', async () => {
  const loginResponse = await request('/api/auth/staff/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'wetzy-admin', password: 'correct horse battery staple' }),
  });
  const { token } = await loginResponse.json();

  const logoutResponse = await request('/api/auth/staff/logout', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(logoutResponse.status, 200);

  const profileResponse = await request('/api/auth/staff/me', {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(profileResponse.status, 401);

  assert.ok(logs.some((entry) => entry.action === 'staff_login' && entry.status === 'success'));
  assert.ok(logs.some((entry) => entry.action === 'staff_login' && entry.status === 'failure'));
  assert.ok(logs.some((entry) => entry.action === 'staff_logout' && entry.status === 'success'));
  assert.equal(logs.some((entry) => 'password' in entry || 'token' in entry), false);
});

test('only superadmin can create staff accounts', async () => {
  const userLogin = await request('/api/auth/staff/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'regular-user', password: 'correct horse battery staple' }),
  });
  assert.equal(userLogin.status, 401);

  const superLogin = await request('/api/auth/staff/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'wetzy-super', password: 'correct horse battery staple' }),
  });
  const { token } = await superLogin.json();
  const response = await request('/api/auth/staff/users', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      username: 'new-admin',
      email: 'new-admin@example.com',
      password: 'a-strong-unique-password',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.user.role, 'admin');
  assert.equal('passwordHash' in body.user, false);
});
