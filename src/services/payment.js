// Zahlungsabwicklung (simulierter Payment-Provider für Lehrzwecke).
const crypto = require('crypto');

const METHODS = {
  rechnung: { label: 'Kauf auf Rechnung (30 Tage netto)', minLevel: 'restricted' },
  kreditkarte: { label: 'Kreditkarte', minLevel: 'open' },
  paypal: { label: 'PayPal (Sandbox)', minLevel: 'open' },
  vorkasse: { label: 'Vorkasse / Überweisung', minLevel: 'open' },
};

function luhn(number) {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 12) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function ref(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// Ergebnis: { status: 'bezahlt' | 'offen' | 'fehlgeschlagen', ref, error? }
function process(method, data = {}) {
  switch (method) {
    case 'kreditkarte':
      if (!luhn(data.card_number || '')) return { status: 'fehlgeschlagen', error: 'Kartennummer ungültig (Luhn-Prüfung).' };
      if (data.card_number.replace(/\D/g, '').startsWith('4000')) return { status: 'fehlgeschlagen', error: 'Zahlung vom Kartenaussteller abgelehnt.' };
      return { status: 'bezahlt', ref: ref('CC') };
    case 'paypal':
      return { status: 'bezahlt', ref: ref('PP') };
    case 'rechnung':
      // Zahlung erfolgt später; die Ware wird dennoch sofort freigegeben (Bonität geprüft).
      return { status: 'offen', ref: ref('RE'), release: true };
    case 'vorkasse':
      return { status: 'offen', ref: ref('VK') };
    default:
      return { status: 'fehlgeschlagen', error: 'Unbekannte Zahlungsart.' };
  }
}

module.exports = { METHODS, process };
