// End-to-End-Tests der Kernabläufe gegen eine frische Test-Datenbank.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const dbFile = path.join(os.tmpdir(), `eprocure-test-${process.pid}.sqlite`);
process.env.DB_FILE = dbFile;

const app = require('../src/app');
const { db, init } = require('../src/db/db');

let server;
let base;

before(async () => {
  await init();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  server.close();
  await db.destroy();
  fs.rmSync(dbFile, { force: true });
});

// Minimaler Browser mit Session-Cookie
function client() {
  let cookie = '';
  async function request(method, url, body, headers = {}) {
    const res = await fetch(base + url, {
      method,
      redirect: 'manual',
      headers: { cookie, ...(body && typeof body === 'object' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...headers },
      body: body && typeof body === 'object' ? new URLSearchParams(body).toString() : body,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  }
  return {
    get: (url, headers) => request('GET', url, null, headers),
    post: (url, body, headers) => request('POST', url, body, headers),
    login: (email, password) => request('POST', '/login', { email, password }),
  };
}

test('Gast sieht nur den offenen Markt', async () => {
  const c = client();
  const list = await c.get('/produkte');
  assert.match(list.text, /Business-Notebook/);
  assert.doesNotMatch(list.text, /Hydraulikventil/);
  const monitor = await db('products').where({ sku: 'HW-1003' }).first();
  assert.strictEqual((await c.get(`/produkte/${monitor.id}`)).status, 404);
});

test('Geschäftskunde sieht beschränkten, aber nicht geschlossenen Markt', async () => {
  const c = client();
  await c.login('einkauf@mueller-gmbh.de', 'b2b123');
  const list = await c.get('/produkte');
  assert.match(list.text, /Hydraulikventil/);
  assert.doesNotMatch(list.text, /Sondermaschine/);
});

test('Suche und Filter nach Objekttyp', async () => {
  const c = client();
  const res = await c.get('/produkte?type=digital&q=lizenz');
  assert.match(res.text, /Office-Suite/);
  assert.doesNotMatch(res.text, /Ergonomische Maus/);
});

test('Digitale Bestellung: kein Versand, Lizenzschlüssel sofort', async () => {
  const c = client();
  await c.login('kunde@mail.de', 'kunde123');
  const p = await db('products').where({ sku: 'SW-3001' }).first();
  await c.post('/warenkorb/add', { product_id: p.id, quantity: 1 });
  const res = await c.post('/warenkorb/kasse', { payment_method: 'paypal' });
  assert.strictEqual(res.status, 302);
  const order = await c.get(res.location);
  assert.match(order.text, /[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}/);
  assert.match(order.text, /Abgeschlossen/);
});

test('Privatkunde darf nicht auf Rechnung kaufen, Kreditkarte wird geprüft', async () => {
  const c = client();
  await c.login('kunde@mail.de', 'kunde123');
  const p = await db('products').where({ sku: 'HW-1002' }).first();
  await c.post('/warenkorb/add', { product_id: p.id, quantity: 2 });
  let res = await c.post('/warenkorb/kasse', { payment_method: 'rechnung', address: 'Teststr. 1' });
  assert.match(res.text, /nicht zur Verfügung/);
  res = await c.post('/warenkorb/kasse', { payment_method: 'kreditkarte', card_number: '4000 0000 0000 0002', address: 'Teststr. 1' });
  assert.match(res.text, /abgelehnt/);
  res = await c.post('/warenkorb/kasse', { payment_method: 'kreditkarte', card_number: '4111 1111 1111 1111', address: 'Teststr. 1' });
  assert.strictEqual(res.status, 302);
  assert.strictEqual((await db('products').where({ id: p.id }).first()).stock, 498);
});

test('Verhandlung → Gegenangebot → Vertrag → Abruf als Bestellung', async () => {
  const c = client();
  await c.login('einkauf@mueller-gmbh.de', 'b2b123');
  const p = await db('products').where({ sku: 'HW-1001' }).first();
  let res = await c.post('/verhandlungen', { product_id: p.id, price: 700, quantity: 10 });
  const negUrl = res.location;
  const neg = await c.get(negUrl);
  assert.match(neg.text, /gegenangebot/);
  res = await c.post(`${negUrl}/annehmen`, {});
  const accepted = await c.get(negUrl);
  assert.match(accepted.text, /Vertrag <strong>K-/);
  const contract = await db('contracts').orderBy('id', 'desc').first();
  res = await c.post(`/verhandlungen/vertrag/${contract.id}/abrufen`, { payment_method: 'rechnung', address: 'Industriestr. 5' });
  assert.strictEqual(res.status, 302);
  const order = await db('orders').orderBy('id', 'desc').first();
  assert.strictEqual(Number(order.subtotal), Number(contract.total));
  assert.strictEqual(order.status, 'in_kommissionierung');
});

test('EDIFACT ORDERS über API, Versand erzeugt DESADV', async () => {
  const c = client();
  const edi = "UNA:+.? '\nUNB+UNOC:3+X+Y+261029:1200+1'\nUNH+1+ORDERS:D:96A:UN'\nBGM+220+PO-1+9'\nLIN+1++HW-1002:SA'\nQTY+21:3'\nUNT+5+1'\nUNZ+1+1'";
  let res = await c.post('/api/v1/orders/edifact', edi, { 'content-type': 'application/edifact' });
  assert.strictEqual(res.status, 401);
  res = await c.post('/api/v1/orders/edifact', edi, { 'content-type': 'application/edifact', 'x-api-key': 'demo-b2b-key' });
  assert.strictEqual(res.status, 201);
  const { order_no } = JSON.parse(res.text);
  const order = await db('orders').where({ order_no }).first();

  const admin = client();
  await admin.login('admin@shop.de', 'admin123');
  await admin.post(`/admin/bestellungen/${order.id}`, { action: 'ship' });
  const desadv = await c.get(`/api/v1/orders/${order_no}/desadv`, { 'x-api-key': 'demo-b2b-key' });
  assert.match(desadv.text, /UNH\+1\+DESADV/);
  assert.match(desadv.text, /HW-1002/);
});

test('XML-Katalog Export und Import durch Datenpflege', async () => {
  const c = client();
  const xml = await c.get('/api/v1/catalog.xml');
  assert.match(xml.text, /<SUPPLIER_AID>HW-1001<\/SUPPLIER_AID>/);
  assert.doesNotMatch(xml.text, /IND-2002/);

  const staff = client();
  await staff.login('pflege@shop.de', 'pflege123');
  await staff.post('/admin/schnittstellen/xml-import', {
    xml: '<CATALOG><ARTICLES><ARTICLE><SUPPLIER_AID>NEW-1</SUPPLIER_AID><DESCRIPTION_SHORT>Neu</DESCRIPTION_SHORT><OBJECT_TYPE>digital</OBJECT_TYPE><PRICE>9.99</PRICE></ARTICLE></ARTICLES></CATALOG>',
  });
  assert.ok(await db('products').where({ sku: 'NEW-1', object_type: 'digital' }).first());
  assert.strictEqual((await staff.get('/admin/nutzer')).status, 403);
});

test('Registrierung als Geschäftskunde und Freigabe durch Admin', async () => {
  const c = client();
  await c.post('/registrieren', { name: 'Test', email: 'b2b@test.de', password: 'geheim1', account_type: 'business', company: 'T GmbH', vat_id: 'DE1' });
  let user = await db('users').where({ email: 'b2b@test.de' }).first();
  assert.strictEqual(user.access_level, 'open');
  const admin = client();
  await admin.login('admin@shop.de', 'admin123');
  await admin.post(`/admin/nutzer/${user.id}`, { action: 'approve' });
  user = await db('users').where({ email: 'b2b@test.de' }).first();
  assert.strictEqual(user.access_level, 'restricted');
});

test('Support-Ticket mit Antwort', async () => {
  const c = client();
  await c.login('kunde@mail.de', 'kunde123');
  const res = await c.post('/support', { subject: 'Lieferung?', category: 'Lieferung', body: 'Wo ist mein Paket?' });
  const admin = client();
  await admin.login('admin@shop.de', 'admin123');
  const id = res.location.split('/').pop();
  await admin.post(`/admin/tickets/${id}`, { body: 'Ist unterwegs.' });
  assert.match((await c.get(res.location)).text, /Ist unterwegs/);
});

test('Alle Seiten rendern ohne Fehler', async () => {
  const admin = client();
  await admin.login('admin@shop.de', 'admin123');
  for (const url of ['/', '/produkte', '/produkte/1', '/partner', '/partner/1', '/support', '/warenkorb', '/konto', '/konto/bestellungen',
    '/konto/praeferenzen', '/konto/zugang', '/verhandlungen', '/admin', '/admin/produkte', '/admin/produkte/neu', '/admin/produkte/1',
    '/admin/lieferanten', '/admin/nutzer', '/admin/bestellungen', '/admin/bestellungen/1', '/admin/verhandlungen', '/admin/tickets',
    '/admin/tickets/1', '/admin/schnittstellen', '/verhandlungen/1', '/verhandlungen/vertrag/1', '/api/v1', '/api/v1/products']) {
    const res = await admin.get(url);
    assert.ok([200, 404].includes(res.status), `${url} → ${res.status}`);
    assert.doesNotMatch(res.text, /ReferenceError|TypeError/, url);
  }
});

test('Datenpflege bearbeitet ein Produkt inkl. Spezifikationen', async () => {
  const staff = client();
  await staff.login('pflege@shop.de', 'pflege123');
  const p = await db('products').where({ sku: 'HW-1002' }).first();
  const body = new URLSearchParams({
    sku: p.sku, name: 'Ergonomische Maus Pro', object_type: 'physical', price: '44.90', stock: '10', quality: 'Premium',
    access_level: 'open', active: '1', weight_kg: '0.1', delivery_days: '2',
  });
  body.append('spec_name', 'DPI'); body.append('spec_value', '3200');
  body.append('spec_name', ''); body.append('spec_value', '');
  const res = await staff.post(`/admin/produkte/${p.id}`, body.toString(), { 'content-type': 'application/x-www-form-urlencoded' });
  assert.strictEqual(res.status, 302);
  const updated = await db('products').where({ id: p.id }).first();
  assert.strictEqual(updated.name, 'Ergonomische Maus Pro');
  assert.deepStrictEqual(JSON.parse(updated.specs), { DPI: '3200' });
  assert.strictEqual(updated.updated_by, 2);
});
