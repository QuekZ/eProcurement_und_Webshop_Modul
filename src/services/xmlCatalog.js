// XML-Katalogaustausch (an BMEcat angelehnt) für Import und Export von Produktdaten.
const { XMLBuilder, XMLParser } = require('fast-xml-parser');

function exportCatalog(products) {
  const builder = new XMLBuilder({ format: true, ignoreAttributes: false });
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build({
    CATALOG: {
      '@_version': '1.0',
      HEADER: { GENERATOR: 'eProcurement Webshop', DATE: new Date().toISOString() },
      ARTICLES: {
        ARTICLE: products.map((p) => ({
          SUPPLIER_AID: p.sku,
          DESCRIPTION_SHORT: p.name,
          DESCRIPTION_LONG: p.description || '',
          OBJECT_TYPE: p.object_type,
          CATEGORY: p.category_name || '',
          SUPPLIER: p.supplier_name || '',
          QUALITY: p.quality,
          USAGE: p.usage_purpose || '',
          DELIVERY_TIME: p.delivery_days,
          PRICE: { '@_currency': 'EUR', '#text': Number(p.price).toFixed(2) },
          ACCESS: p.access_level,
          FEATURES: { FEATURE: Object.entries(p.specs || {}).map(([name, value]) => ({ FNAME: name, FVALUE: value })) },
        })),
      },
    },
  });
}

// Liefert normalisierte Artikeldaten aus einem XML-Katalog.
function parseCatalog(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => ['ARTICLE', 'FEATURE'].includes(name) });
  const doc = parser.parse(xml);
  const articles = doc?.CATALOG?.ARTICLES?.ARTICLE;
  if (!articles) throw new Error('Kein <CATALOG><ARTICLES><ARTICLE> gefunden.');
  return articles.map((a) => {
    const price = typeof a.PRICE === 'object' ? a.PRICE['#text'] : a.PRICE;
    const specs = {};
    for (const f of a.FEATURES?.FEATURE || []) specs[f.FNAME] = String(f.FVALUE);
    if (!a.SUPPLIER_AID || !a.DESCRIPTION_SHORT || price === undefined) {
      throw new Error('Jeder Artikel benötigt SUPPLIER_AID, DESCRIPTION_SHORT und PRICE.');
    }
    return {
      sku: String(a.SUPPLIER_AID),
      name: String(a.DESCRIPTION_SHORT),
      description: a.DESCRIPTION_LONG ? String(a.DESCRIPTION_LONG) : null,
      object_type: ['digital', 'semi_digital', 'physical'].includes(a.OBJECT_TYPE) ? a.OBJECT_TYPE : 'physical',
      quality: ['Basic', 'Standard', 'Premium'].includes(a.QUALITY) ? a.QUALITY : 'Standard',
      usage_purpose: a.USAGE ? String(a.USAGE) : null,
      delivery_days: a.DELIVERY_TIME ? Number(a.DELIVERY_TIME) : 3,
      access_level: ['open', 'restricted', 'closed'].includes(a.ACCESS) ? a.ACCESS : 'open',
      price: Number(price),
      specs: JSON.stringify(specs),
    };
  });
}

module.exports = { exportCatalog, parseCatalog };
