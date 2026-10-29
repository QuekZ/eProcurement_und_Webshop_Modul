const router = require('express').Router();
const crypto = require('crypto');
const { db } = require('../db/db');
const catalog = require('../services/catalog');
const orders = require('../services/orders');
const negotiation = require('../services/negotiation');
const edifact = require('../services/edifact');
const xmlCatalog = require('../services/xmlCatalog');
const { effectiveLevel } = require('../services/access');
const { requireRole } = require('../middleware/auth');

const staff = requireRole('admin', 'datapfleger');
const admin = requireRole('admin');

router.use(staff);

// Datenqualität: Vollständigkeit der Produktdaten (Aufgabe des Datenpflege-Personals)
function completeness(p) {
  const specs = p.specs ? JSON.parse(p.specs) : {};
  const checks = [
    [Boolean(p.description), 'Beschreibung'],
    [Object.keys(specs).length > 0, 'Spezifikationen'],
    [Boolean(p.usage_purpose), 'Verwendungszweck'],
    [Boolean(p.category_id), 'Kategorie'],
    [Boolean(p.supplier_id), 'Lieferant'],
    [!p.negotiable || Boolean(p.min_price), 'Preisuntergrenze'],
    [p.object_type === 'digital' || Number(p.weight_kg) > 0, 'Gewicht'],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
  return { score: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}

router.get('/', async (req, res) => {
  const c = async (q) => Number((await q.count({ c: '*' }).first()).c);
  const products = await db('products');
  res.render('admin/dashboard', {
    title: 'Backoffice',
    stats: {
      revenue: Number((await db('orders').whereNot('status', 'storniert').sum({ s: 'total' }).first()).s || 0),
      openOrders: await c(db('orders').whereIn('status', ['neu', 'in_kommissionierung'])),
      negotiations: await c(db('negotiations').whereIn('status', ['offen', 'gegenangebot'])),
      tickets: await c(db('tickets').where('status', 'offen')),
      pendingUsers: await c(db('users').where('approved', false)),
      dataQuality: Math.round(products.reduce((s, p) => s + completeness(p).score, 0) / (products.length || 1)),
      byType: Object.fromEntries((await db('products').select('object_type').count({ c: '*' }).groupBy('object_type')).map((r) => [r.object_type, Number(r.c)])),
    },
    edi: await db('edi_messages').orderBy('id', 'desc').limit(5),
  });
});

/* ---------- Produkte (Datenpflege) ---------- */

router.get('/produkte', async (req, res) => {
  const list = await db('products as p').leftJoin('users as u', 'u.id', 'p.updated_by').select('p.*', 'u.name as editor').orderBy('p.name');
  list.forEach((p) => { p.quality_check = completeness(p); });
  res.render('admin/products', { title: 'Produktdaten', list });
});

async function productForm(res, product, error) {
  const opts = await catalog.filterOptions();
  res.render('admin/product-form', { title: product.id ? 'Produkt bearbeiten' : 'Neues Produkt', product, error, ...opts });
}

router.get('/produkte/neu', (req, res) => productForm(res, { object_type: 'physical', quality: 'Standard', access_level: 'open', specs: '{}' }));

router.get('/produkte/:id', async (req, res, next) => {
  const product = await db('products').where({ id: req.params.id }).first();
  if (!product) return next();
  productForm(res, product);
});

function productData(body, user) {
  const specs = {};
  (body.spec_name || []).forEach((name, i) => {
    if (name && body.spec_value[i]) specs[name.trim()] = body.spec_value[i].trim();
  });
  return {
    sku: body.sku.trim(),
    name: body.name.trim(),
    description: body.description || null,
    category_id: body.category_id || null,
    supplier_id: body.supplier_id || null,
    object_type: body.object_type,
    price: Number(body.price),
    min_price: body.min_price ? Number(body.min_price) : null,
    negotiable: Boolean(body.negotiable),
    stock: parseInt(body.stock, 10) || 0,
    quality: body.quality,
    usage_purpose: body.usage_purpose || null,
    weight_kg: body.object_type === 'digital' ? 0 : Number(body.weight_kg) || 0,
    delivery_days: parseInt(body.delivery_days, 10) || 0,
    access_level: body.access_level,
    active: Boolean(body.active),
    specs: JSON.stringify(specs),
    updated_by: user.id,
    updated_at: db.fn.now(),
  };
}

router.post('/produkte{/:id}', async (req, res) => {
  const body = { spec_name: [], spec_value: [], ...req.body };
  body.spec_name = [].concat(body.spec_name);
  body.spec_value = [].concat(body.spec_value);
  if (!body.sku || !body.name || !(Number(body.price) > 0)) {
    return productForm(res, { ...req.body, id: req.params.id, specs: '{}' }, 'SKU, Name und ein Preis > 0 sind Pflichtfelder.');
  }
  const data = productData(body, req.user);
  if (data.min_price && data.min_price > data.price) return productForm(res, { ...data, id: req.params.id }, 'Die Preisuntergrenze darf nicht über dem Listenpreis liegen.');
  try {
    if (req.params.id) await db('products').where({ id: req.params.id }).update(data);
    else await db('products').insert(data);
  } catch (err) {
    return productForm(res, { ...data, id: req.params.id }, /unique/i.test(err.message) ? 'Diese SKU existiert bereits.' : err.message);
  }
  req.session.flash = { type: 'success', text: `Produkt ${data.name} gespeichert.` };
  res.redirect('/admin/produkte');
});

/* ---------- Lieferanten / Marktteilnehmer ---------- */

router.get('/lieferanten', async (req, res) => {
  res.render('admin/suppliers', { title: 'Lieferanten', list: await db('suppliers').orderBy('name') });
});

router.post('/lieferanten', async (req, res) => {
  const b = req.body;
  if (b.name) {
    await db('suppliers').insert({
      name: b.name, street: b.street, city: b.city, country: (b.country || 'DE').toUpperCase(), email: b.email,
      credit_rating: b.credit_rating, credit_score: parseInt(b.credit_score, 10) || null, references_text: b.references_text,
      industries: b.industries, certified: Boolean(b.certified),
    });
  }
  res.redirect('/admin/lieferanten');
});

/* ---------- Nutzer & Marktzugang ---------- */

router.get('/nutzer', admin, async (req, res) => {
  res.render('admin/users', {
    title: 'Nutzer & Marktzugang',
    list: await db('users').orderBy([{ column: 'approved', order: 'asc' }, { column: 'created_at', order: 'desc' }]),
    invites: await db('invite_codes as i').leftJoin('users as u', 'u.id', 'i.used_by').select('i.*', 'u.email as used_by_email'),
  });
});

router.post('/nutzer/:id', admin, async (req, res) => {
  const user = await db('users').where({ id: req.params.id }).first();
  if (req.body.action === 'approve') {
    await db('users').where({ id: user.id }).update({ access_level: user.requested_level, approved: true });
  } else if (req.body.action === 'reject') {
    await db('users').where({ id: user.id }).update({ requested_level: user.access_level, approved: true });
  } else if (req.body.action === 'update') {
    await db('users').where({ id: user.id }).update({ access_level: req.body.access_level, requested_level: req.body.access_level, role: req.body.role, approved: true });
  }
  res.redirect('/admin/nutzer');
});

router.post('/einladungen', admin, async (req, res) => {
  const code = `INV-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  await db('invite_codes').insert({ code, access_level: req.body.access_level === 'closed' ? 'closed' : 'restricted' });
  req.session.flash = { type: 'success', text: `Einladungscode ${code} erstellt.` };
  res.redirect('/admin/nutzer');
});

/* ---------- Bestellungen & Logistik ---------- */

router.get('/bestellungen', admin, async (req, res) => {
  const list = await db('orders as o').leftJoin('users as u', 'u.id', 'o.user_id')
    .select('o.*', 'u.name as customer', 'u.company').orderBy('o.created_at', 'desc');
  res.render('admin/orders', { title: 'Bestellungen', list });
});

router.get('/bestellungen/:id', admin, async (req, res, next) => {
  const order = await orders.getOrder(req.params.id);
  if (!order) return next();
  const customer = await db('users').where({ id: order.user_id }).first();
  const messages = await db('edi_messages').where({ reference: order.order_no }).orderBy('id');
  res.render('admin/order', { title: `Bestellung ${order.order_no}`, order, customer, messages });
});

router.post('/bestellungen/:id', admin, async (req, res) => {
  const id = req.params.id;
  const actions = {
    paid: () => orders.markPaid(id),
    ship: () => orders.ship(id),
    deliver: () => orders.deliver(id),
    cancel: () => db('orders').where({ id }).update({ status: 'storniert' }),
    orders_edi: async () => {
      const order = await orders.getOrder(id);
      const customer = await db('users').where({ id: order.user_id }).first();
      await edifact.log('out', 'EDIFACT', 'ORDERS', order.order_no, edifact.buildOrders(order, order.items, customer));
    },
  };
  if (actions[req.body.action]) await actions[req.body.action]();
  res.redirect(`/admin/bestellungen/${id}`);
});

/* ---------- Verhandlungen ---------- */

router.get('/verhandlungen', admin, async (req, res) => {
  const list = await db('negotiations as n').join('products as p', 'p.id', 'n.product_id').join('users as u', 'u.id', 'n.user_id')
    .select('n.*', 'p.name as product_name', 'p.price as list_price', 'p.min_price', 'u.name as customer', 'u.company')
    .orderBy('n.updated_at', 'desc');
  const contracts = await db('contracts as k').join('products as p', 'p.id', 'k.product_id').join('users as u', 'u.id', 'k.user_id')
    .select('k.*', 'p.name as product_name', 'u.name as customer').orderBy('k.created_at', 'desc');
  res.render('admin/negotiations', { title: 'Verhandlungen & Verträge', list, contracts });
});

// Manuelle Entscheidung des Vertriebs (übersteuert den Agenten)
router.post('/verhandlungen/:id', admin, async (req, res) => {
  const neg = await db('negotiations').where({ id: req.params.id }).first();
  if (neg && ['offen', 'gegenangebot'].includes(neg.status)) {
    const price = Number(req.body.price) || Number(neg.current_price);
    const decision = { decision: req.body.decision, price, message: req.body.message || 'Manuelle Entscheidung durch den Vertrieb.' };
    if (['angenommen', 'abgelehnt', 'gegenangebot'].includes(decision.decision)) await negotiation.applyDecision(neg.id, decision);
  }
  res.redirect('/admin/verhandlungen');
});

/* ---------- Customer Care ---------- */

router.get('/tickets', admin, async (req, res) => {
  const list = await db('tickets as t').join('users as u', 'u.id', 't.user_id').select('t.*', 'u.name as customer')
    .orderByRaw("case t.status when 'offen' then 0 when 'beantwortet' then 1 else 2 end").orderBy('t.created_at', 'desc');
  res.render('admin/tickets', { title: 'Support-Tickets', list });
});

router.get('/tickets/:id', admin, async (req, res, next) => {
  const ticket = await db('tickets').where({ id: req.params.id }).first();
  if (!ticket) return next();
  const messages = await db('ticket_messages').where({ ticket_id: ticket.id }).orderBy('id');
  const order = ticket.order_id ? await db('orders').where({ id: ticket.order_id }).first() : null;
  const customer = await db('users').where({ id: ticket.user_id }).first();
  res.render('ticket', { title: ticket.subject, ticket, messages, order, customer, admin: true });
});

router.post('/tickets/:id', admin, async (req, res) => {
  if (req.body.close) {
    await db('tickets').where({ id: req.params.id }).update({ status: 'geschlossen' });
  } else if (req.body.body) {
    await db('ticket_messages').insert({ ticket_id: req.params.id, author: 'support', body: req.body.body });
    await db('tickets').where({ id: req.params.id }).update({ status: 'beantwortet' });
  }
  res.redirect(`/admin/tickets/${req.params.id}`);
});

/* ---------- Schnittstellen (XML / EDIFACT) ---------- */

router.get('/schnittstellen', async (req, res) => {
  res.render('admin/interfaces', {
    title: 'Schnittstellen',
    messages: await db('edi_messages').orderBy('id', 'desc').limit(50),
    customers: await db('users').where('role', 'customer').orderBy('name'),
    sampleOrders: "UNA:+.? '\nUNB+UNOC:3+MUELLER-ERP+WEBSHOP-EPROC+261029:1200+0001'\nUNH+1+ORDERS:D:96A:UN'\nBGM+220+PO-4711+9'\nDTM+137:20261029:102'\nNAD+BY+++Müller GmbH'\nLIN+1++HW-1002:SA'\nQTY+21:10'\nLIN+2++SW-3001:SA'\nQTY+21:5'\nUNS+S'\nUNT+10+1'\nUNZ+1+0001'",
    result: req.session.importResult,
  });
  delete req.session.importResult;
});

router.get('/schnittstellen/nachricht/:id', async (req, res) => {
  const msg = await db('edi_messages').where({ id: req.params.id }).first();
  res.type('text/plain').send(msg ? msg.content : 'Nicht gefunden');
});

router.post('/schnittstellen/xml-import', async (req, res) => {
  try {
    const articles = xmlCatalog.parseCatalog(req.body.xml || '');
    await edifact.log('in', 'XML', 'CATALOG', `${articles.length} Artikel`, req.body.xml);
    let created = 0;
    let updated = 0;
    for (const a of articles) {
      const existing = await db('products').where({ sku: a.sku }).first();
      if (existing) {
        await db('products').where({ id: existing.id }).update({ ...a, updated_by: req.user.id, updated_at: db.fn.now() });
        updated++;
      } else {
        await db('products').insert({ ...a, stock: 0, updated_by: req.user.id });
        created++;
      }
    }
    req.session.importResult = { type: 'success', text: `XML-Import: ${created} neu angelegt, ${updated} aktualisiert.` };
  } catch (err) {
    req.session.importResult = { type: 'error', text: `XML-Import fehlgeschlagen: ${err.message}` };
  }
  res.redirect('/admin/schnittstellen');
});

router.post('/schnittstellen/edifact-import', async (req, res) => {
  try {
    const customer = await db('users').where({ id: req.body.customer_id }).first();
    if (!customer) throw new Error('Bitte Kunden auswählen.');
    const parsed = edifact.parseOrders(req.body.edifact || '');
    await edifact.log('in', 'EDIFACT', 'ORDERS', parsed.orderRef, req.body.edifact);
    const level = effectiveLevel(customer);
    const items = [];
    for (const it of parsed.items) {
      const product = (await catalog.search({ q: it.sku }, level)).find((p) => p.sku === it.sku);
      if (!product) throw new Error(`Artikel ${it.sku} unbekannt oder für den Kunden nicht freigegeben.`);
      items.push({ product, quantity: it.quantity });
    }
    const order = await orders.createOrder({
      user: customer, items, channel: 'edifact', paymentMethod: level === 'open' ? 'vorkasse' : 'rechnung',
      address: customer.address || customer.company || customer.name,
    });
    req.session.importResult = { type: 'success', text: `EDIFACT ORDERS ${parsed.orderRef} → Bestellung ${order.order_no} angelegt.` };
  } catch (err) {
    req.session.importResult = { type: 'error', text: `EDIFACT-Import fehlgeschlagen: ${err.message}` };
  }
  res.redirect('/admin/schnittstellen');
});

router.get('/schnittstellen/katalog.xml', async (req, res) => {
  res.type('application/xml').attachment('katalog.xml').send(xmlCatalog.exportCatalog(await catalog.search({}, 'closed')));
});

module.exports = router;
