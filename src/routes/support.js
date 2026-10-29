// Electronic Customer Care: FAQ, Ticketsystem mit Bezug zu Bestellungen.
const router = require('express').Router();
const { db } = require('../db/db');
const { requireLogin } = require('../middleware/auth');

const FAQ = [
  ['Wann erhalte ich meinen Lizenzschlüssel?', 'Digitale und semi-digitale Güter erhalten sofort nach Zahlungseingang einen Lizenzschlüssel unter „Mein Konto → Bestellungen“.'],
  ['Wie kann ich den Lieferstatus verfolgen?', 'Sobald Ihre Ware versandt wurde, sehen Sie Versanddienstleister und Sendungsnummer in der Bestellübersicht.'],
  ['Was bedeuten offener, beschränkter und geschlossener Markt?', 'Der offene Markt ist für alle sichtbar. Der beschränkte Markt steht geprüften Geschäftskunden offen, der geschlossene Markt nur eingeladenen Konsortialpartnern.'],
  ['Kann ich Preise verhandeln?', 'Bei Produkten mit dem Hinweis „verhandelbar“ können Sie ein Angebot abgeben. Bei Einigung entsteht ein Vertrag, den Sie direkt abrufen können.'],
  ['Wie binde ich mein ERP-System an?', 'Über die REST-API mit API-Key (Mein Konto) können Sie Kataloge als XML abrufen und Bestellungen als EDIFACT ORDERS übermitteln.'],
];

router.get('/', async (req, res) => {
  const tickets = req.user ? await db('tickets').where({ user_id: req.user.id }).orderBy('created_at', 'desc') : [];
  const userOrders = req.user ? await db('orders').where({ user_id: req.user.id }).orderBy('created_at', 'desc') : [];
  res.render('support', { title: 'Kundenservice', faq: FAQ, tickets, orders: userOrders });
});

router.post('/', requireLogin, async (req, res) => {
  if (!req.body.subject || !req.body.body) return res.redirect('/support');
  const orderId = req.body.order_id
    ? (await db('orders').where({ id: req.body.order_id, user_id: req.user.id }).first())?.id
    : null;
  const [row] = await db('tickets').insert({
    user_id: req.user.id, subject: req.body.subject, category: req.body.category, order_id: orderId || null,
  }).returning('id');
  const id = typeof row === 'object' ? row.id : row;
  await db('ticket_messages').insert({ ticket_id: id, author: 'kunde', body: req.body.body });
  res.redirect(`/support/${id}`);
});

router.get('/:id', requireLogin, async (req, res, next) => {
  const ticket = await db('tickets').where({ id: req.params.id, user_id: req.user.id }).first();
  if (!ticket) return next();
  const messages = await db('ticket_messages').where({ ticket_id: ticket.id }).orderBy('id');
  const order = ticket.order_id ? await db('orders').where({ id: ticket.order_id }).first() : null;
  res.render('ticket', { title: ticket.subject, ticket, messages, order, admin: false });
});

router.post('/:id', requireLogin, async (req, res, next) => {
  const ticket = await db('tickets').where({ id: req.params.id, user_id: req.user.id }).first();
  if (!ticket) return next();
  if (req.body.close) {
    await db('tickets').where({ id: ticket.id }).update({ status: 'geschlossen' });
  } else if (req.body.body) {
    await db('ticket_messages').insert({ ticket_id: ticket.id, author: 'kunde', body: req.body.body });
    await db('tickets').where({ id: ticket.id }).update({ status: 'offen' });
  }
  res.redirect(`/support/${ticket.id}`);
});

module.exports = router;
