// Informations- & Suchfunktionen: Bereitstellung von Markt- und Produktdaten.
const { db } = require('../db/db');
const { visibleLevels } = require('./access');

const OBJECT_TYPES = {
  digital: 'Digital',
  semi_digital: 'Semi-digital',
  physical: 'Physisch',
};

const QUALITY_RANK = { Basic: 1, Standard: 2, Premium: 3 };

function baseQuery(level) {
  return db('products as p')
    .leftJoin('categories as c', 'c.id', 'p.category_id')
    .leftJoin('suppliers as s', 's.id', 'p.supplier_id')
    .select('p.*', 'c.name as category_name', 's.name as supplier_name', 's.credit_rating as supplier_rating')
    .where('p.active', true)
    .whereIn('p.access_level', visibleLevels(level));
}

function parse(product) {
  if (!product) return product;
  return { ...product, price: Number(product.price), specs: product.specs ? JSON.parse(product.specs) : {} };
}

async function search(params, level) {
  const q = baseQuery(level);
  if (params.q) {
    const term = `%${params.q.toLowerCase()}%`;
    q.where((w) => w
      .whereRaw('lower(p.name) like ?', [term])
      .orWhereRaw('lower(p.description) like ?', [term])
      .orWhereRaw('lower(p.sku) like ?', [term])
      .orWhereRaw('lower(p.usage_purpose) like ?', [term])
      .orWhereRaw('lower(p.specs) like ?', [term]));
  }
  if (params.category) q.where('p.category_id', params.category);
  if (params.type) q.where('p.object_type', params.type);
  if (params.supplier) q.where('p.supplier_id', params.supplier);
  if (params.quality) q.where('p.quality', params.quality);
  if (params.min_price) q.where('p.price', '>=', Number(params.min_price));
  if (params.max_price) q.where('p.price', '<=', Number(params.max_price));
  if (params.negotiable) q.where('p.negotiable', true);
  if (params.in_stock) q.where('p.stock', '>', 0);

  const sorts = {
    price_asc: ['p.price', 'asc'],
    price_desc: ['p.price', 'desc'],
    name: ['p.name', 'asc'],
    delivery: ['p.delivery_days', 'asc'],
  };
  const [col, dir] = sorts[params.sort] || ['p.name', 'asc'];
  q.orderBy(col, dir);
  return (await q).map(parse);
}

async function getProduct(id, level) {
  return parse(await baseQuery(level).where('p.id', id).first());
}

async function filterOptions() {
  return {
    categories: await db('categories').orderBy('name'),
    suppliers: await db('suppliers').orderBy('name'),
  };
}

module.exports = { OBJECT_TYPES, QUALITY_RANK, search, getProduct, filterOptions, parse };
