const router = require('express').Router();
const catalog = require('../services/catalog');
const orders = require('../services/orders');
const payment = require('../services/payment');
const { canAccess } = require('../services/access');
const { requireLogin } = require('../middleware/auth');

// Lädt die Warenkorbpositionen; Produkte ohne Marktzugang werden entfernt.
async function loadCart(req) {
  const cart = req.session.cart || {};
  const items = [];
  for (const [id, quantity] of Object.entries(cart)) {
    const product = await catalog.getProduct(id, req.level);
    if (product) items.push({ product, quantity, unit_price: product.price });
    else delete cart[id];
  }
  return items;
}

function totals(items) {
  const lines = items.map((i) => ({ ...i.product, quantity: i.quantity, unit_price: i.unit_price }));
  const subtotal = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const shipping = orders.shippingCost(lines);
  return { subtotal, shipping, total: subtotal + shipping, needsAddress: lines.some((l) => orders.needsShipping(l.object_type)) };
}

function paymentMethods(user) {
  return Object.entries(payment.METHODS).filter(([, m]) => canAccess(user, m.minLevel));
}

router.get('/', async (req, res) => {
  const items = await loadCart(req);
  res.render('cart', { title: 'Warenkorb', items, totals: totals(items), freeFrom: orders.FREE_SHIPPING_FROM });
});

router.post('/add', async (req, res) => {
  const product = await catalog.getProduct(req.body.product_id, req.level);
  if (!product) return res.redirect('/produkte');
  const qty = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  req.session.cart = req.session.cart || {};
  req.session.cart[product.id] = (req.session.cart[product.id] || 0) + qty;
  req.session.flash = { type: 'success', text: `${product.name} wurde in den Warenkorb gelegt.` };
  res.redirect(req.get('Referer') || '/warenkorb');
});

router.post('/update', (req, res) => {
  const cart = req.session.cart || {};
  const qty = parseInt(req.body.quantity, 10);
  if (qty > 0) cart[req.body.product_id] = qty;
  else delete cart[req.body.product_id];
  res.redirect('/warenkorb');
});

router.get('/kasse', requireLogin, async (req, res) => {
  const items = await loadCart(req);
  if (!items.length) return res.redirect('/warenkorb');
  res.render('checkout', { title: 'Kasse', items, totals: totals(items), methods: paymentMethods(req.user), action: '/warenkorb/kasse', contract: null });
});

router.post('/kasse', requireLogin, async (req, res) => {
  const items = await loadCart(req);
  try {
    const order = await orders.createOrder({
      user: req.user,
      items,
      paymentMethod: req.body.payment_method,
      paymentData: req.body,
      address: req.body.address,
    });
    req.session.cart = {};
    req.session.flash = { type: 'success', text: `Bestellung ${order.order_no} wurde aufgegeben.` };
    res.redirect(`/konto/bestellungen/${order.id}`);
  } catch (err) {
    res.status(400).render('checkout', {
      title: 'Kasse', items, totals: totals(items), methods: paymentMethods(req.user), action: '/warenkorb/kasse', contract: null, error: err.message,
    });
  }
});

module.exports = router;
module.exports.totals = totals;
module.exports.paymentMethods = paymentMethods;
