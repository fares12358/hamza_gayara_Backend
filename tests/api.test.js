// End to end API test on a temporary in-memory database. All data here is made up.
// It never reads backend/.env database settings.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';

let replset;
let app;
let owner;
let staff;
let modules;

before(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  // Set before the app is imported. dotenv never overrides existing variables.
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: replset.getUri('gayara_test'),
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    CLIENT_ORIGIN: 'http://localhost:5173',
    SERVE_FRONTEND: 'false',
  });
  const { createApp } = await import('../src/app.js');
  const db = await import('../src/config/db.js');
  const { User } = await import('../src/modules/users/users.model.js');
  const { hashPassword } = await import('../src/modules/users/users.service.js');
  const { Settings } = await import('../src/modules/settings/settings.model.js');
  const { Entry } = await import('../src/modules/entries/entries.model.js');
  modules = { db, Entry };

  await db.connectDatabase(process.env.MONGODB_URI);
  app = createApp();

  const passwordHash = await hashPassword('password123');
  await User.create([
    { name: 'Owner', username: 'owner', role: 'owner', passwordHash },
    { name: 'Staff', username: 'staff', role: 'staff', passwordHash },
  ]);
  await Settings.create({ cashOpening: 100000, cashAsOf: '2026-01-31', ledgerAsOf: '2026-01-31' });

  owner = request.agent(app);
  staff = request.agent(app);
  await owner.post('/api/auth/login').send({ username: 'owner', password: 'password123' }).expect(200);
  await staff.post('/api/auth/login').send({ username: 'staff', password: 'password123' }).expect(200);
});

after(async () => {
  await modules?.db.disconnectDatabase();
  await replset?.stop();
});

const day = new Date().toISOString().slice(0, 10) > '2026-02-01' ? '2026-02-01' : new Date().toISOString().slice(0, 10);
let customerId;
let invoiceId;

test('login is required, and a wrong password is refused', async () => {
  await request(app).get('/api/customers').expect(401);
  await request(app).post('/api/auth/login').send({ username: 'owner', password: 'wrong-password' }).expect(401);
});

test('writes from another website are blocked', async () => {
  await owner.post('/api/customers').set('Origin', 'https://evil.example').send({ name: 'عميل' }).expect(403);
});

test('owner adds a customer; a different spelling is a duplicate', async () => {
  const res = await owner.post('/api/customers').send({ name: 'ثلاجة تجريبية', openingBalance: 100000 }).expect(201);
  customerId = res.body.customer.id;
  await owner.post('/api/customers').send({ name: 'ثلاجه تجريبيه' }).expect(409);
});

test('invoice and its payment are saved together, once', async () => {
  const body = { customerId, date: day, amount: 50000, returnAmount: 5000, paidAmount: 20000, requestId: 'request-invoice-1' };
  const first = await owner.post('/api/entries/invoice').send(body).expect(201);
  const again = await owner.post('/api/entries/invoice').send(body).expect(201);
  assert.equal(first.body.entries.length, 2);
  assert.deepEqual(again.body.entries.map((e) => e.id), first.body.entries.map((e) => e.id));
  assert.equal(await modules.Entry.countDocuments(), 2);
  invoiceId = first.body.entries[0].id;
  const changed = await owner.post('/api/entries/invoice').send({ ...body, amount: 60000 }).expect(409);
  assert.equal(changed.body.error.code, 'REQUEST_REUSED');

  const list = await owner.get('/api/customers').expect(200);
  assert.equal(list.body.customers[0].balance, 125000);
  const cash = await owner.get('/api/treasury/balance').expect(200);
  assert.equal(cash.body.balance, 120000);
});

test('the same request sent twice at the same moment is saved once', async () => {
  const body = { type: 'cash_sale', date: day, amount: 1000, requestId: 'request-parallel-1' };
  const results = await Promise.all([owner.post('/api/entries/cash').send(body), owner.post('/api/entries/cash').send(body)]);
  assert.deepEqual(results.map((r) => r.status), [201, 201]);
  assert.equal(await modules.Entry.countDocuments({ type: 'cash_sale' }), 1);
});

test('bad input is rejected', async () => {
  const base = { customerId, date: day, requestId: 'request-bad-0001' };
  await owner.post('/api/entries/invoice').send({ ...base, amount: 100, returnAmount: 200 }).expect(400);
  await owner.post('/api/entries/invoice').send({ ...base, amount: 10.5 }).expect(400);
  await owner.post('/api/entries/invoice').send({ ...base, amount: -5 }).expect(400);
  await owner.post('/api/entries/invoice').send({ ...base, amount: 5, date: '2999-01-01' }).expect(400);
});

test('a date inside the sheet period needs confirmation', async () => {
  const body = { type: 'cash_sale', date: '2026-01-15', amount: 500, requestId: 'request-old-00001' };
  const refused = await owner.post('/api/entries/cash').send(body).expect(409);
  assert.equal(refused.body.error.code, 'BACKDATED');
  await owner.post('/api/entries/cash').send({ ...body, confirmBackdated: true }).expect(201);
});

test('staff can record a cheque with a photo but nothing else', async () => {
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  const res = await staff
    .post('/api/cheques')
    .send({ customerId, date: day, amount: 25000, number: '1', image, requestId: 'request-cheque-01' })
    .expect(201);
  await staff.get(`/api/cheques/images/${res.body.cheque.cheque.imageId}`).expect(200).expect('Content-Type', /jpeg/);
  await staff.get('/api/customers').expect(200);
  await staff.get('/api/treasury').expect(403);
  await staff.get('/api/reports/income').expect(403);
  await staff.get('/api/users').expect(403);
  await staff.post('/api/customers').send({ name: 'ممنوع' }).expect(403);
  await staff.post(`/api/entries/${res.body.cheque.id}/void`).send({}).expect(403);
});

test('cancelling an invoice cancels its payment and keeps the records', async () => {
  const res = await owner.post(`/api/entries/${invoiceId}/void`).send({ reason: 'test' }).expect(200);
  assert.equal(res.body.voided.length, 2);
  assert.equal(await modules.Entry.countDocuments({ voidedAt: { $ne: null } }), 2);
  const statement = await owner.get(`/api/customers/${customerId}/statement?range=0`).expect(200);
  assert.equal(statement.body.customer.balance, 75000);
  await owner.post(`/api/entries/${invoiceId}/void`).send({}).expect(404);
});

test('treasury and income reports agree with the records', async () => {
  const ledger = await owner.get('/api/treasury').expect(200);
  assert.equal(ledger.body.balance, 101500);
  assert.equal(ledger.body.rows.at(-1).balance, 101500);
  const income = await owner.get(`/api/reports/income?month=${day.slice(0, 7)}`).expect(200);
  assert.equal(income.body.selected.cashSales, 1000);
  assert.equal(income.body.selected.chequeCollections, 25000);
});

test('disabling a user ends their session; owner cannot disable themselves', async () => {
  const { body } = await owner.get('/api/users').expect(200);
  const idOf = (name) => body.users.find((u) => u.username === name).id;
  await owner.patch(`/api/users/${idOf('owner')}`).send({ active: false }).expect(400);
  await owner.patch(`/api/users/${idOf('staff')}`).send({ active: false }).expect(200);
  await staff.get('/api/customers').expect(401);
});
