const router = require('express').Router();
const crypto = require('crypto');
const { db } = require('../db/db');
const catalog = require('../services/catalog');
const matching = require('../services/matching');
const orders = require('../services/orders');
const { requireLogin } = require('../middleware/auth');

router.use(requireLogin);

// Transaktionsstatus auf einen Blick: Verhandlungen, Verträge, Lieferungen, Tickets
router.get('/', async (req, res) => {
  const uid = req.user.id;
  const count = async (table, where) => Number((await db(table).where({ user_id: uid, ...where }).count({ c: '*' }).first()).c);
  res.render('account/index', {
    title: 'Mein Konto',
    stats: {
      orders: await count('orders', {}),
      inDelivery: Number((await db('orders').where({ user_id: uid }).whereIn('status', ['in_kommissionierung', 'versandt']).count({ c: '*' }).first()).c),
      negotiations: Number((await db('negotiations').where({ user_id: uid }).whereIn('status', ['offen', 'gegenangebot']).count({ c: '*' }).first()).c),
      contracts: await count('contracts', { status: 'aktiv' }),
      tickets: Number((await db('tickets').where({ user_id: uid }).whereNot('status', 'geschlossen').count({ c: '*' }).first()).c),
    },
    recentOrders: await db('orders').where({ user_id: uid }).orderBy('created_at', 'desc').limit(5),
  });
});

router.get('/bestellungen', async (req, res) => {
  const list = await db('orders').where({ user_id: req.user.id }).orderBy('created_at', 'desc');
  res.render('account/orders', { title: 'Meine Bestellungen', list });
});

router.get('/bestellungen/:id', async (req, res, next) => {
  const order = await orders.getOrder(req.params.id);
  if (!order || order.user_id !== req.user.id) return next();
  const contract = order.contract_id ? await db('contracts').where({ id: order.contract_id }).first() : null;
  res.render('account/order', { title: `Bestellung ${order.order_no}`, order, contract });
});

router.get('/praeferenzen', async (req, res) => {
  res.render('account/preferences', {
    title: 'Einkaufspräferenzen',
    prefs: matching.parsePreferences(req.user) || {},
    categories: (await catalog.filterOptions()).categories,
  });
});

router.post('/praeferenzen', async (req, res) => {
  const { category_id, object_type, max_price, min_quality } = req.body;
  await db('users').where({ id: req.user.id }).update({
    preferences: JSON.stringify({ category_id: category_id || null, object_type: object_type || null, max_price: max_price || null, min_quality: min_quality || null }),
  });
  req.session.flash = { type: 'success', text: 'Präferenzen gespeichert – Ihre Empfehlungen wurden aktualisiert.' };
  res.redirect('/');
});

router.get('/zugang', (req, res) => res.render('account/access', { title: 'Marktzugang & Schnittstellen' }));

// Antrag auf Höherstufung oder Einlösen eines Einladungscodes
router.post('/zugang', async (req, res) => {
  if (req.body.invite_code) {
    const invite = await db('invite_codes').where({ code: req.body.invite_code.trim() }).whereNull('used_by').first();
    if (!invite) {
      req.session.flash = { type: 'error', text: 'Einladungscode ungültig.' };
    } else {
      await db('invite_codes').where({ code: invite.code }).update({ used_by: req.user.id });
      await db('users').where({ id: req.user.id }).update({ access_level: invite.access_level, requested_level: invite.access_level, approved: true });
      req.session.flash = { type: 'success', text: 'Einladungscode eingelöst – Ihr Marktzugang wurde erweitert.' };
    }
  } else if (req.body.company && req.body.vat_id) {
    await db('users').where({ id: req.user.id }).update({ company: req.body.company, vat_id: req.body.vat_id, requested_level: 'restricted', approved: false });
    req.session.flash = { type: 'info', text: 'Antrag auf beschränkten Marktzugang eingereicht.' };
  }
  res.redirect('/konto/zugang');
});

router.post('/api-key', async (req, res) => {
  await db('users').where({ id: req.user.id }).update({ api_key: crypto.randomBytes(16).toString('hex') });
  res.redirect('/konto/zugang');
});

module.exports = router;
