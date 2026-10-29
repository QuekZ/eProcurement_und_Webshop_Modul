const router = require('express').Router();
const { db } = require('../db/db');
const catalog = require('../services/catalog');
const negotiation = require('../services/negotiation');
const orders = require('../services/orders');
const { requireLogin } = require('../middleware/auth');
const { totals, paymentMethods } = require('./cart');

router.use(requireLogin);

async function ownNegotiation(req) {
  return db('negotiations').where({ id: req.params.id, user_id: req.user.id }).first();
}

router.get('/', async (req, res) => {
  const list = await db('negotiations as n').join('products as p', 'p.id', 'n.product_id')
    .select('n.*', 'p.name as product_name', 'p.price as list_price')
    .where('n.user_id', req.user.id).orderBy('n.updated_at', 'desc');
  const contracts = await db('contracts as k').join('products as p', 'p.id', 'k.product_id')
    .select('k.*', 'p.name as product_name').where('k.user_id', req.user.id).orderBy('k.created_at', 'desc');
  res.render('negotiations', { title: 'Verhandlungen & Verträge', list, contracts });
});

// Neue Verhandlung mit Erstangebot starten
router.post('/', async (req, res) => {
  const product = await catalog.getProduct(req.body.product_id, req.level);
  if (!product || !product.negotiable) return res.redirect('/produkte');
  const price = Number(req.body.price);
  const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  const [row] = await db('negotiations').insert({
    user_id: req.user.id,
    product_id: product.id,
    quantity,
    current_price: price,
    payment_terms: req.body.payment_terms || '30 Tage netto',
    delivery_terms: req.body.delivery_terms || 'DAP (frei Haus)',
  }).returning('id');
  const id = typeof row === 'object' ? row.id : row;
  await negotiation.submitOffer(id, { price, quantity, message: req.body.message });
  res.redirect(`/verhandlungen/${id}`);
});

router.get('/:id', async (req, res, next) => {
  const neg = await ownNegotiation(req);
  if (!neg) return next();
  const product = await db('products').where({ id: neg.product_id }).first();
  const messages = await db('negotiation_messages').where({ negotiation_id: neg.id }).orderBy('id');
  const contract = await db('contracts').where({ negotiation_id: neg.id }).first();
  res.render('negotiation', { title: `Verhandlung #${neg.id}`, neg, product, messages, contract, maxRounds: negotiation.MAX_ROUNDS });
});

router.post('/:id/angebot', async (req, res, next) => {
  const neg = await ownNegotiation(req);
  if (!neg) return next();
  if (neg.status === 'gegenangebot' || neg.status === 'offen') {
    await negotiation.submitOffer(neg.id, {
      price: Number(req.body.price),
      quantity: Math.max(1, parseInt(req.body.quantity, 10) || neg.quantity),
      message: req.body.message,
    });
  }
  res.redirect(`/verhandlungen/${neg.id}`);
});

router.post('/:id/annehmen', async (req, res, next) => {
  const neg = await ownNegotiation(req);
  if (!neg) return next();
  if (neg.status === 'gegenangebot') await negotiation.acceptCounter(neg.id);
  res.redirect(`/verhandlungen/${neg.id}`);
});

// Vertrag einsehen
router.get('/vertrag/:id', async (req, res, next) => {
  const contract = await db('contracts').where({ id: req.params.id, user_id: req.user.id }).first();
  if (!contract) return next();
  const product = await db('products as p').leftJoin('suppliers as s', 's.id', 'p.supplier_id')
    .select('p.*', 's.name as supplier_name', 's.street', 's.city', 's.country').where('p.id', contract.product_id).first();
  res.render('contract', { title: `Vertrag ${contract.contract_no}`, contract, product });
});

// Vertrag abrufen = Bestellung zum Vertragspreis auslösen
async function contractCheckout(req) {
  const contract = await db('contracts').where({ id: req.params.id, user_id: req.user.id, status: 'aktiv' }).first();
  if (!contract) return null;
  const product = catalog.parse(await db('products').where({ id: contract.product_id }).first());
  return { contract, items: [{ product, quantity: contract.quantity, unit_price: Number(contract.unit_price) }] };
}

router.get('/vertrag/:id/abrufen', async (req, res, next) => {
  const data = await contractCheckout(req);
  if (!data) return next();
  res.render('checkout', { title: 'Vertrag abrufen', items: data.items, totals: totals(data.items), methods: paymentMethods(req.user),
    action: `/verhandlungen/vertrag/${data.contract.id}/abrufen`, contract: data.contract });
});

router.post('/vertrag/:id/abrufen', async (req, res, next) => {
  const data = await contractCheckout(req);
  if (!data) return next();
  try {
    const order = await orders.createOrder({
      user: req.user, items: data.items, paymentMethod: req.body.payment_method, paymentData: req.body,
      address: req.body.address, contractId: data.contract.id,
    });
    res.redirect(`/konto/bestellungen/${order.id}`);
  } catch (err) {
    res.status(400).render('checkout', { title: 'Vertrag abrufen', items: data.items, totals: totals(data.items), methods: paymentMethods(req.user),
      action: `/verhandlungen/vertrag/${data.contract.id}/abrufen`, contract: data.contract, error: err.message });
  }
});

module.exports = router;
