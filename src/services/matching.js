// Matching von Kundenpräferenzen und Produktangeboten (Verhandlungs- & Abschlusslogik).
const { QUALITY_RANK } = require('./catalog');

function parsePreferences(user) {
  if (!user || !user.preferences) return null;
  try {
    return JSON.parse(user.preferences);
  } catch {
    return null;
  }
}

// Liefert einen Score von 0–100 sowie die Gründe für die Bewertung.
function score(product, prefs) {
  let points = 0;
  let max = 0;
  const reasons = [];

  if (prefs.category_id) {
    max += 30;
    if (Number(prefs.category_id) === product.category_id) {
      points += 30;
      reasons.push('Wunschkategorie');
    }
  }
  if (prefs.object_type) {
    max += 20;
    if (prefs.object_type === product.object_type) {
      points += 20;
      reasons.push('Bevorzugte Güterart');
    }
  }
  if (prefs.max_price) {
    max += 30;
    const budget = Number(prefs.max_price);
    if (product.price <= budget) {
      points += 30;
      reasons.push('Im Budget');
    } else if (product.negotiable && product.min_price && Number(product.min_price) <= budget) {
      points += 20;
      reasons.push('Budget per Verhandlung erreichbar');
    } else {
      points += Math.max(0, 30 * (1 - (product.price - budget) / budget));
    }
  }
  if (prefs.min_quality) {
    max += 20;
    if (QUALITY_RANK[product.quality] >= QUALITY_RANK[prefs.min_quality]) {
      points += 20;
      reasons.push(`Qualität ≥ ${prefs.min_quality}`);
    }
  }
  return { score: max ? Math.round((points / max) * 100) : 0, reasons };
}

function rank(products, prefs, limit = 4) {
  if (!prefs) return [];
  return products
    .map((p) => ({ ...p, match: score(p, prefs) }))
    .filter((p) => p.match.score >= 50)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit);
}

module.exports = { parsePreferences, score, rank };
