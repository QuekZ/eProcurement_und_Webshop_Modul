// UN/EDIFACT-Nachrichten (D.96A): ORDERS (Bestellung), DESADV (Lieferavis), INVOIC (Rechnung).
const { db } = require('../db/db');

const SENDER = 'WEBSHOP-EPROC';

function esc(value) {
  return String(value ?? '').replace(/([?+:'])/g, '?$1');
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return {
    short: `${String(date.getFullYear()).slice(2)}${p(date.getMonth() + 1)}${p(date.getDate())}:${p(date.getHours())}${p(date.getMinutes())}`,
    long: `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`,
  };
}

// Baut eine komplette Interchange (UNA … UNZ) um die Nachrichtensegmente.
function interchange(type, receiver, segments) {
  const ref = Date.now().toString().slice(-8);
  const body = [`UNH+1+${type}:D:96A:UN`, ...segments];
  body.push(`UNT+${body.length + 1}+1`);
  return [
    "UNA:+.? '",
    `UNB+UNOC:3+${SENDER}+${esc(receiver)}+${stamp().short}+${ref}`,
    ...body,
    `UNZ+1+${ref}`,
  ].map((s) => (s.startsWith('UNA') ? s : `${s}'`)).join('\n');
}

function lineItems(items, qtyQualifier) {
  return items.flatMap((it, i) => [
    `LIN+${i + 1}++${esc(it.sku)}:SA`,
    `IMD+F++:::${esc(it.name)}`,
    `QTY+${qtyQualifier}:${it.quantity}`,
    `PRI+AAA:${Number(it.unit_price).toFixed(2)}`,
  ]);
}

function buildOrders(order, items, buyer) {
  return interchange('ORDERS', 'SUPPLIER', [
    `BGM+220+${esc(order.order_no)}+9`,
    `DTM+137:${stamp(new Date(order.created_at || Date.now())).long}:102`,
    `NAD+BY+++${esc(buyer.company || buyer.name)}`,
    ...lineItems(items, 21),
    'UNS+S',
  ]);
}

function buildDesadv(order, items, customer) {
  const physical = items.filter((i) => i.object_type !== 'digital');
  return interchange('DESADV', customer.company || customer.name, [
    `BGM+351+DES${esc(order.order_no)}+9`,
    `DTM+11:${stamp().long}:102`,
    `RFF+ON:${esc(order.order_no)}`,
    `RFF+CN:${esc(order.tracking_no)}`,
    `NAD+DP+++${esc(customer.company || customer.name)}+${esc(order.shipping_address)}`,
    `TDT+20++30+${esc(order.carrier)}`,
    'CPS+1',
    ...lineItems(physical, 12),
  ]);
}

function buildInvoic(order, items, customer) {
  return interchange('INVOIC', customer.company || customer.name, [
    `BGM+380+INV${esc(order.order_no)}+9`,
    `DTM+137:${stamp().long}:102`,
    `RFF+ON:${esc(order.order_no)}`,
    `NAD+IV+++${esc(customer.company || customer.name)}`,
    ...lineItems(items, 47),
    'UNS+S',
    `MOA+79:${Number(order.subtotal).toFixed(2)}`,
    `MOA+144:${Number(order.shipping_cost).toFixed(2)}`,
    `MOA+77:${Number(order.total).toFixed(2)}`,
  ]);
}

// Zerlegt eine EDIFACT-Nachricht in Segmente unter Beachtung des Freigabezeichens "?".
function segments(text) {
  const out = [];
  let cur = '';
  const src = text.replace(/^UNA.{6}/, '').replace(/\r?\n/g, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '?') {
      cur += ch + (src[++i] || '');
    } else if (ch === "'") {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  const split = (s, sep) => s.split(new RegExp(`(?<!\\?)\\${sep}`)).map((x) => x.replace(/\?(.)/g, '$1'));
  return out.map((seg) => split(seg, '+').map((el) => split(el, ':')));
}

// Liest eine eingehende ORDERS-Nachricht: { orderRef, items: [{ sku, quantity }] }
function parseOrders(text) {
  const segs = segments(text);
  const unh = segs.find((s) => s[0][0] === 'UNH');
  if (!unh || unh[2][0] !== 'ORDERS') throw new Error('Keine gültige ORDERS-Nachricht (UNH fehlt).');
  const bgm = segs.find((s) => s[0][0] === 'BGM');
  const items = [];
  for (const s of segs) {
    if (s[0][0] === 'LIN') items.push({ sku: s[3] && s[3][0], quantity: 1 });
    if (s[0][0] === 'QTY' && items.length) items[items.length - 1].quantity = parseInt(s[1][1], 10);
  }
  if (!items.length) throw new Error('Die Nachricht enthält keine Positionen (LIN).');
  return { orderRef: bgm ? bgm[2][0] : null, items };
}

async function log(direction, format, messageType, reference, content) {
  await db('edi_messages').insert({ direction, format, message_type: messageType, reference, content });
}

module.exports = { buildOrders, buildDesadv, buildInvoic, parseOrders, log };
