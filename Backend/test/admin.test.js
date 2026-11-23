const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { createAuthService } = require('../src/services/auth-service');
const { createDatasetService } = require('../src/services/dataset-service');

const JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';
const PASSWORD = 'correct horse battery staple';
const users = [];
const logs = [];
const datasets = [];
const records = [];
let counter = 0;
const newId = () => (++counter).toString(16).padStart(24, '0');

const thenable = (value) => ({ sort() { return this; }, limit() { return this; }, then: (a, b) => Promise.resolve(value).then(a, b) });

const User = {
  findOne({ $or }) { return { select() { return this; }, then: (a, b) => Promise.resolve(users.find((u) => $or.some((c) => u.username === c.username || u.email === c.email)) || null).then(a, b) }; },
  findById: (id) => Promise.resolve(users.find((u) => u._id === String(id)) || null),
  find: () => ({ sort: () => Promise.resolve(users) }),
  async findByIdAndUpdate(id, update) { const u = users.find((x) => x._id === String(id)); if (u) { if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) u[k] = (u[k] || 0) + v; if (update.$set) Object.assign(u, update.$set); } return u || null; },
  async create(r) { const u = { _id: newId(), ...r, isActive: true, tokenVersion: 0 }; users.push(u); return u; },
  countDocuments: async (f) => users.filter((u) => (!f.role || (f.role.$in ? f.role.$in.includes(u.role) : u.role === f.role)) && (f.isActive === undefined || u.isActive === f.isActive)).length,
};
const SystemLog = { async create(e) { logs.push(e); return e; }, find: (f = {}) => thenable(logs.filter((l) => !f.status || l.status === f.status).map((l, i) => ({ _id: String(i), ...l })).reverse()) };
const Dataset = {
  async create(r) { const d = { _id: newId(), insertedRows: 0, rejectedRows: 0, errorSamples: [], ...r }; datasets.push(d); return d; },
  findById: async (id) => datasets.find((d) => d._id === id) || null,
  find: (f = {}) => thenable(datasets.filter((d) => !f.status || d.status === f.status)),
  async findByIdAndUpdate(id, u) { const d = datasets.find((x) => x._id === id); if (!d) return null; if (u.$inc) for (const [k, v] of Object.entries(u.$inc)) d[k] += v; if (u.$set) Object.assign(d, u.$set); if (u.$push) d.errorSamples.push(...u.$push.errorSamples.$each); return d; },
  async findByIdAndDelete(id) { const i = datasets.findIndex((d) => d._id === id); if (i >= 0) datasets.splice(i, 1); },
  countDocuments: async (f) => datasets.filter((d) => !f.status || d.status === f.status).length,
};
const DatasetRecord = {
  async insertMany(docs) { records.push(...docs); },
  async deleteMany({ datasetId }) { for (let i = records.length - 1; i >= 0; i -= 1) if (records[i].datasetId === datasetId) records.splice(i, 1); },
  find: ({ datasetId }) => thenable(records.filter((r) => r.datasetId === datasetId)),
};

let server; let apiUrl;
const call = (path, { token, body, method = body ? 'POST' : 'GET' } = {}) => fetch(`${apiUrl}${path}`, {
  method,
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
async function login(identifier) {
  const response = await call('/api/auth/staff/login', { body: { identifier, password: PASSWORD } });
  return (await response.json()).token;
}
const floodRow = (over = {}) => ({ province: 'นครศรีธรรมราช', amphoe: 'Bang Khan', year: '2024', month: '5', flooded: '1', flood_status: 'ท่วม', max_flood_ha: '12.5', ...over });
const floodColumns = ['province', 'amphoe', 'year', 'month', 'flooded', 'flood_status', 'max_flood_ha'];

before(async () => {
  for (const [_id, username, role] of [['admin-1', 'adm', 'admin'], ['user-1', 'usr', 'user']]) {
    users.push({ _id, username, email: `${username}@example.com`, role, isActive: true, tokenVersion: 0, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  }
  const authService = createAuthService({ jwtSecret: JWT_SECRET }, { User, SystemLog });
  const datasetService = createDatasetService({ Dataset, DatasetRecord, User, SystemLog, isValidId: (id) => /^[0-9a-f]{24}$/.test(id) });
  server = http.createServer(createApp({ corsOrigins: ['*'], jwtSecret: JWT_SECRET, mlServiceUrl: 'http://127.0.0.1:1', mlServiceTimeoutMs: 100 }, { authService, datasetService }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  apiUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test('admin routes reject anonymous callers and non-staff users', async () => {
  assert.equal((await call('/api/admin/datasets')).status, 401);
  users.push({ _id: 'user-2', username: 'usr2', email: 'usr2@example.com', role: 'user', isActive: true, tokenVersion: 0, passwordHash: 'x' });
  const staffOnly = createAuthService({ jwtSecret: JWT_SECRET }, { User, SystemLog });
  const token = staffOnly.signToken(users.find((u) => u._id === 'user-2'));
  assert.equal((await call('/api/admin/datasets', { token })).status, 403);
});

test('admin can upload a dataset in chunks, preview it, and delete it', async () => {
  const token = await login('adm');
  const created = await call('/api/admin/datasets', { token, body: { type: 'flood', name: 'น้ำท่วม 2024', filename: 'flood.csv', columns: floodColumns, totalRows: 3 } });
  assert.equal(created.status, 201);
  const { dataset } = await created.json();

  const first = await (await call(`/api/admin/datasets/${dataset.id}/rows`, { token, body: { rows: [floodRow(), floodRow({ month: '6' })] } })).json();
  assert.equal(first.accepted, 2);
  const second = await (await call(`/api/admin/datasets/${dataset.id}/rows`, { token, body: { rows: [floodRow({ flooded: 'abc' })] } })).json();
  assert.equal(second.rejected, 1);
  assert.match(second.errors[0].message, /flooded/);

  const done = await (await call(`/api/admin/datasets/${dataset.id}/complete`, { token, method: 'POST' })).json();
  assert.equal(done.dataset.status, 'ready');
  assert.equal(done.dataset.insertedRows, 2);

  const preview = await (await call(`/api/admin/datasets/${dataset.id}/preview?limit=5`, { token })).json();
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0].flooded, 1); // coerced to a number

  const overview = await (await call('/api/admin/overview', { token })).json();
  assert.equal(overview.datasets.ready, 1);
  assert.equal(overview.datasets.records, 2);

  assert.equal((await call(`/api/admin/datasets/${dataset.id}`, { token, method: 'DELETE' })).status, 200);
  assert.equal(records.length, 0);
  assert.ok(logs.some((l) => l.action.startsWith('dataset_upload:')));
});

test('uploads are validated: missing columns, unknown types, over-declared rows, bad ids', async () => {
  const token = await login('adm');
  const noColumns = await call('/api/admin/datasets', { token, body: { type: 'flood', name: 'x', columns: ['province'], totalRows: 1 } });
  assert.equal(noColumns.status, 422);
  assert.equal((await call('/api/admin/datasets', { token, body: { type: 'nope', name: 'x', columns: [], totalRows: 1 } })).status, 400);

  const { dataset } = await (await call('/api/admin/datasets', { token, body: { type: 'flood', name: 'small', columns: floodColumns, totalRows: 1 } })).json();
  const over = await call(`/api/admin/datasets/${dataset.id}/rows`, { token, body: { rows: [floodRow(), floodRow()] } });
  assert.equal(over.status, 409);
  assert.equal((await call('/api/admin/datasets/not-an-id/preview', { token })).status, 400);
});

test('row chunks larger than 32kb are accepted on the rows route only', async () => {
  const token = await login('adm');
  const rows = Array.from({ length: 400 }, (_, i) => floodRow({ amphoe: `District ${i} ${'x'.repeat(100)}` }));
  const { dataset } = await (await call('/api/admin/datasets', { token, body: { type: 'flood', name: 'big', columns: floodColumns, totalRows: rows.length } })).json();
  const response = await call(`/api/admin/datasets/${dataset.id}/rows`, { token, body: { rows } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).accepted, 400);
  const huge = await call('/api/admin/datasets', { token, body: { type: 'flood', name: 'y'.repeat(40000), columns: floodColumns, totalRows: 1 } });
  assert.equal(huge.status, 413);
});
