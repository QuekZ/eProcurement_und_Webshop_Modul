// Verhandlungsagent des Anbieters: bewertet Angebote anhand von Listenpreis,
// Preisuntergrenze und Abnahmemenge und erzeugt bei Einigung einen Vertrag.
const { db } = require('../db/db');

const MAX_ROUNDS = 3;

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Mengenrabatt senkt die akzeptable Untergrenze (max. 5 %).
function floorPrice(product, quantity) {
  const floor = Number(product.min_price || product.price);
  const discount = Math.min(0.05, Math.floor(quantity / 10) * 0.01);
  return round2(floor * (1 - discount));
}

// Entscheidung des Agenten auf ein Kundenangebot.
function evaluateOffer(product, offer, quantity, rounds) {
  const list = Number(product.price);
  const floor = floorPrice(product, quantity);

  if (offer >= list) return { decision: 'angenommen', price: list, message: 'Listenpreis – Angebot angenommen.' };
  // Ab der Mitte zwischen Untergrenze und Listenpreis wird sofort angenommen.
  if (offer >= round2(floor + (list - floor) / 2)) {
    return { decision: 'angenommen', price: round2(offer), message: 'Ihr Angebot wurde angenommen.' };
  }
  if (rounds >= MAX_ROUNDS) {
    if (offer >= floor) return { decision: 'angenommen', price: round2(offer), message: 'Letzte Runde – wir nehmen Ihr Angebot an.' };
    return { decision: 'abgelehnt', price: floor, message: `Maximale Verhandlungsrunden erreicht. Unser letztes Angebot lag bei ${floor.toFixed(2)} €.` };
  }
  // Gegenangebot: Mittelwert zwischen Kundenangebot und Listenpreis, nie unter der Untergrenze.
  const counter = Math.max(floor, round2((offer + list) / 2));
  return {
    decision: 'gegenangebot',
    price: counter,
    message: `Wir können Ihnen ${counter.toFixed(2)} € pro Stück bei ${quantity} Stück anbieten.`,
  };
}

function contractNo() {
  return `K-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

// Erzeugt den rechtsverbindlichen Vertrag mit allen Hard Facts.
async function createContract(trx, negotiation, product) {
  const delivery = new Date();
  delivery.setDate(delivery.getDate() + Number(product.delivery_days || 3));
  const unit = Number(negotiation.current_price);
  const [id] = await trx('contracts').insert({
    contract_no: contractNo(),
    negotiation_id: negotiation.id,
    user_id: negotiation.user_id,
    product_id: negotiation.product_id,
    quantity: negotiation.quantity,
    unit_price: unit,
    total: round2(unit * negotiation.quantity),
    payment_terms: negotiation.payment_terms,
    delivery_terms: negotiation.delivery_terms,
    delivery_date: delivery.toISOString().slice(0, 10),
  }).returning('id');
  return typeof id === 'object' ? id.id : id;
}

// Wendet eine Entscheidung (vom Agenten oder manuell vom Admin) auf die Verhandlung an.
async function applyDecision(negotiationId, decision) {
  return db.transaction(async (trx) => {
    const neg = await trx('negotiations').where({ id: negotiationId }).first();
    const product = await trx('products').where({ id: neg.product_id }).first();
    await trx('negotiation_messages').insert({
      negotiation_id: neg.id, author: 'anbieter', price: decision.price, quantity: neg.quantity, message: decision.message,
    });
    await trx('negotiations').where({ id: neg.id }).update({
      status: decision.decision, current_price: decision.price, updated_at: trx.fn.now(),
    });
    if (decision.decision === 'angenommen') {
      return createContract(trx, { ...neg, current_price: decision.price }, product);
    }
    return null;
  });
}

// Kunde gibt ein (neues) Angebot ab.
async function submitOffer(negotiationId, { price, quantity, message }) {
  const neg = await db('negotiations').where({ id: negotiationId }).first();
  const product = await db('products').where({ id: neg.product_id }).first();
  const rounds = neg.rounds + 1;
  await db('negotiation_messages').insert({ negotiation_id: neg.id, author: 'kunde', price, quantity, message });
  await db('negotiations').where({ id: neg.id }).update({ quantity, current_price: price, rounds, status: 'offen' });
  const decision = evaluateOffer(product, price, quantity, rounds);
  return applyDecision(neg.id, decision);
}

// Kunde akzeptiert das Gegenangebot des Anbieters.
async function acceptCounter(negotiationId) {
  const neg = await db('negotiations').where({ id: negotiationId }).first();
  return applyDecision(neg.id, { decision: 'angenommen', price: Number(neg.current_price), message: 'Gegenangebot vom Kunden angenommen.' });
}

module.exports = { MAX_ROUNDS, evaluateOffer, floorPrice, submitOffer, acceptCounter, applyDecision };
