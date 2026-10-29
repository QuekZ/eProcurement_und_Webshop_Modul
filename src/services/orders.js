// Bestellabwicklung inkl. Objekt-Klassifizierung (digital, semi-digital, physisch)
// und Logistik-Anbindung (EDIFACT DESADV / INVOIC).
const crypto = require('crypto');
const { db } = require('../db/db');
const payment = require('./payment');
const edifact = require('./edifact');
const { canAccess } = require('./access');

const FREE_SHIPPING_FROM = 250;
const CARRIERS = ['DHL', 'DPD', 'UPS'];

function needsShipping(objectType) {
  return objectType !== 'digital';
}

// Versandkosten nur für physische Anteile, gestaffelt nach Gewicht.
function shippingCost(items) {
  const shippable = items.filter((i) => needsShipping(i.object_type));
  if (!shippable.length) return 0;
  const subtotal = shippable.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  if (subtotal >= FREE_SHIPPING_FROM) return 0;
  const weight = shippable.reduce((s, i) => s + Number(i.weight_kg || 0) * i.quantity, 0);
  if (weight > 30) return 49;
  if (weight > 5) return 9.9;
  return 4.9;
}

function licenseKey() {
  return crypto.randomBytes(10).toString('hex').toUpperCase().match(/.{1,5}/g).join('-');
}

function orderNo() {
  return `B${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
}

// items: [{ product, quantity, unit_price }]
async function createOrder({ user, items, paymentMethod, paymentData, address, channel = 'webshop', contractId = null }) {
  if (!items.length) throw new Error('Der Warenkorb ist leer.');
  const lines = items.map((i) => ({ ...i.product, quantity: i.quantity, unit_price: Number(i.unit_price ?? i.product.price) }));
  const anyShipping = lines.some((l) => needsShipping(l.object_type));
  if (anyShipping && !address) throw new Error('Für physische Güter wird eine Lieferadresse benötigt.');

  const method = payment.METHODS[paymentMethod];
  if (!method || !canAccess(user, method.minLevel)) throw new Error('Diese Zahlungsart steht Ihnen nicht zur Verfügung.');

  const subtotal = Math.round(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0) * 100) / 100;
  const shipping = shippingCost(lines);
  const result = payment.process(paymentMethod, paymentData);
  if (result.status === 'fehlgeschlagen') throw new Error(result.error);

  const orderId = await db.transaction(async (trx) => {
    for (const l of lines) {
      const current = await trx('products').where({ id: l.id }).first();
      if (needsShipping(current.object_type) && current.stock < l.quantity) {
        throw new Error(`Nicht genügend Bestand für ${current.name} (verfügbar: ${current.stock}).`);
      }
      if (needsShipping(current.object_type)) await trx('products').where({ id: l.id }).decrement('stock', l.quantity);
    }
    const [row] = await trx('orders').insert({
      order_no: orderNo(),
      user_id: user.id,
      channel,
      payment_method: paymentMethod,
      payment_status: result.status,
      payment_ref: result.ref,
      subtotal,
      shipping_cost: shipping,
      total: subtotal + shipping,
      shipping_address: anyShipping ? address : null,
      contract_id: contractId,
    }).returning('id');
    const id = typeof row === 'object' ? row.id : row;
    await trx('order_items').insert(lines.map((l) => ({
      order_id: id, product_id: l.id, sku: l.sku, name: l.name, object_type: l.object_type, quantity: l.quantity, unit_price: l.unit_price,
    })));
    if (contractId) await trx('contracts').where({ id: contractId }).update({ status: 'abgerufen', order_id: id });
    return id;
  });

  if (result.status === 'bezahlt' || result.release) await release(orderId, result.status === 'bezahlt');
  return getOrder(orderId);
}

// Freigabe nach Zahlungseingang: Lizenzen für digitale Anteile, Kommissionierung für physische.
async function release(orderId, paid = true) {
  const order = await db('orders').where({ id: orderId }).first();
  const items = await db('order_items').where({ order_id: orderId });
  for (const it of items) {
    if (it.object_type !== 'physical' && !it.license_key) {
      await db('order_items').where({ id: it.id }).update({ license_key: licenseKey() });
    }
  }
  const status = items.some((i) => needsShipping(i.object_type)) ? 'in_kommissionierung' : 'abgeschlossen';
  await db('orders').where({ id: orderId }).update({ status, ...(paid ? { payment_status: 'bezahlt' } : {}) });

  const customer = await db('users').where({ id: order.user_id }).first();
  const fresh = await db('orders').where({ id: orderId }).first();
  await edifact.log('out', 'EDIFACT', 'INVOIC', fresh.order_no, edifact.buildInvoic(fresh, items, customer));
}

async function markPaid(orderId) {
  const order = await db('orders').where({ id: orderId }).first();
  if (order.status === 'neu') return release(orderId, true);
  await db('orders').where({ id: orderId }).update({ payment_status: 'bezahlt' });
}

// Versand an den Logistikdienstleister melden (DESADV).
async function ship(orderId) {
  const order = await db('orders').where({ id: orderId }).first();
  const carrier = CARRIERS[order.id % CARRIERS.length];
  const tracking = `${carrier}${Date.now().toString().slice(-10)}`;
  await db('orders').where({ id: orderId }).update({ status: 'versandt', carrier, tracking_no: tracking });
  const fresh = await db('orders').where({ id: orderId }).first();
  const items = await db('order_items').where({ order_id: orderId });
  const customer = await db('users').where({ id: order.user_id }).first();
  await edifact.log('out', 'EDIFACT', 'DESADV', order.order_no, edifact.buildDesadv(fresh, items, customer));
}

async function deliver(orderId) {
  const order = await db('orders').where({ id: orderId }).first();
  await db('orders').where({ id: orderId }).update({ status: 'zugestellt' });
  if (order.contract_id) await db('contracts').where({ id: order.contract_id }).update({ status: 'erfuellt' });
}

async function getOrder(id) {
  const order = await db('orders').where({ id }).first();
  if (!order) return null;
  order.items = await db('order_items').where({ order_id: id });
  return order;
}

module.exports = { FREE_SHIPPING_FROM, needsShipping, shippingCost, createOrder, release, markPaid, ship, deliver, getOrder };
