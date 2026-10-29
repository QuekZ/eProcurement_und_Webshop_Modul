// Gezielte Marktpartnersuche: Adressdaten, Bonitätsauskunft und Referenzen.
const router = require('express').Router();
const { db } = require('../db/db');
const { visibleLevels } = require('../services/access');

router.get('/', async (req, res) => {
  const levels = visibleLevels(req.level);
  const q = db('suppliers as s')
    .leftJoin('products as p', function joinVisible() {
      this.on('p.supplier_id', 's.id').andOnVal('p.active', true).andOnIn('p.access_level', levels);
    })
    .select('s.*')
    .count({ product_count: 'p.id' })
    .groupBy('s.id')
    .orderBy('s.credit_score', 'desc');

  const f = req.query;
  if (f.q) {
    const term = `%${f.q.toLowerCase()}%`;
    q.where((w) => w.whereRaw('lower(s.name) like ?', [term]).orWhereRaw('lower(s.industries) like ?', [term]).orWhereRaw('lower(s.references_text) like ?', [term]));
  }
  if (f.country) q.where('s.country', f.country);
  if (f.min_score) q.where('s.credit_score', '>=', Number(f.min_score));
  if (f.certified) q.where('s.certified', true);

  const countries = (await db('suppliers').distinct('country').orderBy('country')).map((c) => c.country);
  res.render('partners', { title: 'Marktpartner', suppliers: await q, query: f, countries });
});

router.get('/:id', async (req, res, next) => {
  const supplier = await db('suppliers').where({ id: req.params.id }).first();
  if (!supplier) return next();
  const products = await db('products').where({ supplier_id: supplier.id, active: true })
    .whereIn('access_level', visibleLevels(req.level)).orderBy('name');
  res.render('partner', { title: supplier.name, supplier, products });
});

module.exports = router;
