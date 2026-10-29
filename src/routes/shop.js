const router = require('express').Router();
const { db } = require('../db/db');
const catalog = require('../services/catalog');
const matching = require('../services/matching');
const { visibleLevels } = require('../services/access');

router.get('/', async (req, res) => {
  const products = await catalog.search({}, req.level);
  const prefs = matching.parsePreferences(req.user);
  const segments = await db('products').where('active', true).select('access_level').count({ count: '*' }).groupBy('access_level');
  res.render('home', {
    title: 'Start',
    featured: products.slice(0, 6),
    recommendations: matching.rank(products, prefs),
    hasPrefs: Boolean(prefs),
    segments: Object.fromEntries(segments.map((s) => [s.access_level, Number(s.count)])),
    visible: visibleLevels(req.level),
  });
});

router.get('/produkte', async (req, res) => {
  const products = await catalog.search(req.query, req.level);
  const prefs = matching.parsePreferences(req.user);
  if (prefs) products.forEach((p) => { p.match = matching.score(p, prefs); });
  res.render('products', { title: 'Produkte', products, query: req.query, ...(await catalog.filterOptions()) });
});

router.get('/produkte/:id', async (req, res, next) => {
  const product = await catalog.getProduct(req.params.id, req.level);
  if (!product) return next();
  const supplier = await db('suppliers').where({ id: product.supplier_id }).first();
  const prefs = matching.parsePreferences(req.user);
  const related = (await catalog.search({ category: product.category_id }, req.level)).filter((p) => p.id !== product.id).slice(0, 3);
  res.render('product', {
    title: product.name,
    product,
    supplier,
    related,
    match: prefs ? matching.score(product, prefs) : null,
  });
});

module.exports = router;
