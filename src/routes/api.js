// Schnittstellen für B2B-Partner: JSON, XML-Katalog (BMEcat-ähnlich) und EDIFACT.
const router = require('express').Router();
const { db } = require('../db/db');
const catalog = require('../services/catalog');
const orders = require('../services/orders');
const edifact = require('../services/edifact');
const xmlCatalog = require('../services/xmlCatalog');
const { apiKey } = require('../middleware/auth');

router.use(apiKey);

function requireKey(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ error: 'Gültiger X-API-Key erforderlich.' });
}

router.get('/', (req, res) => res.json({
  name: 'eProcurement Webshop API', version: 'v1', access_level: req.level,
  endpoints: [
    'GET  /api/v1/products?q=&type=&category=',
    'GET  /api/v1/products/:sku',
    'GET  /api/v1/catalog.xml',
    'POST /api/v1/orders/edifact   (Content-Type: application/edifact, X-API-Key)',
    'GET  /api/v1/orders/:orderNo  (X-API-Key)',
    'GET  /api/v1/orders/:orderNo/desadv (X-API-Key)',
  ],
}));

router.get('/products', async (req, res) => {
  const products = await catalog.search(req.query, req.level);
  res.json(products.map(({ min_price, updated_by, ...p }) => p));
});

router.get('/products/:sku', async (req, res) => {
  const [product] = (await catalog.search({ q: req.params.sku }, req.level)).filter((p) => p.sku === req.params.sku);
  if (!product) return res.status(404).json({ error: 'Produkt nicht gefunden.' });
  const { min_price, updated_by, ...rest } = product;
  res.json(rest);
});

router.get('/catalog.xml', async (req, res) => {
  const xml = xmlCatalog.exportCatalog(await catalog.search({}, req.level));
  await edifact.log('out', 'XML', 'CATALOG', `level:${req.level}`, xml);
  res.type('application/xml').send(xml);
});

// Eingehende EDIFACT-Bestellung aus dem ERP-System des Kunden
router.post('/orders/edifact', requireKey, async (req, res) => {
  const text = typeof req.body === 'string' ? req.body : '';
  try {
    const parsed = edifact.parseOrders(text);
    await edifact.log('in', 'EDIFACT', 'ORDERS', parsed.orderRef, text);
    const items = [];
    for (const it of parsed.items) {
      const product = (await catalog.search({ q: it.sku }, req.level)).find((p) => p.sku === it.sku);
      if (!product) throw new Error(`Artikel ${it.sku} unbekannt oder nicht freigegeben.`);
      items.push({ product, quantity: it.quantity });
    }
    const order = await orders.createOrder({
      user: req.user,
      items,
      channel: 'edifact',
      paymentMethod: req.level === 'open' ? 'vorkasse' : 'rechnung',
      address: req.user.address || req.user.company || req.user.name,
    });
    res.status(201).json({ order_no: order.order_no, customer_ref: parsed.orderRef, status: order.status, total: Number(order.total) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

async function ownOrder(req) {
  return db('orders').where({ order_no: req.params.orderNo, user_id: req.user.id }).first();
}

router.get('/orders/:orderNo', requireKey, async (req, res) => {
  const order = await ownOrder(req);
  if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden.' });
  const items = await db('order_items').where({ order_id: order.id }).select('sku', 'name', 'object_type', 'quantity', 'unit_price', 'license_key');
  res.json({ ...order, items });
});

router.get('/orders/:orderNo/desadv', requireKey, async (req, res) => {
  const order = await ownOrder(req);
  const msg = order && await db('edi_messages').where({ message_type: 'DESADV', reference: order.order_no }).orderBy('id', 'desc').first();
  if (!msg) return res.status(404).json({ error: 'Noch kein Lieferavis vorhanden.' });
  res.type('text/plain').send(msg.content);
});

module.exports = router;
