const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { init } = require('./db/db');
const { loadUser } = require('./middleware/auth');
const { OBJECT_TYPES } = require('./services/catalog');
const { LEVEL_LABELS } = require('./services/access');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.text({ type: ['text/plain', 'application/edifact', 'application/xml', 'text/xml'], limit: '2mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

const STATUS_LABELS = {
  neu: 'Neu', bezahlt: 'Bezahlt', in_kommissionierung: 'In Kommissionierung', versandt: 'Versandt',
  zugestellt: 'Zugestellt', abgeschlossen: 'Abgeschlossen', storniert: 'Storniert',
};

// SQLite liefert Zeitstempel als UTC-String ohne Zeitzone ("2026-10-29 12:00:00").
function toDate(value) {
  if (value instanceof Date) return value;
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value);
}

app.use((req, res, next) => {
  res.locals.eur = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
  res.locals.date = (d) => (d ? toDate(d).toLocaleDateString('de-DE') : '–');
  res.locals.datetime = (d) => (d ? toDate(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
  res.locals.OBJECT_TYPES = OBJECT_TYPES;
  res.locals.LEVEL_LABELS = LEVEL_LABELS;
  res.locals.STATUS_LABELS = STATUS_LABELS;
  res.locals.path = req.path;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  const cart = req.session.cart || {};
  res.locals.cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
  next();
});
app.use(loadUser);

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/shop'));
app.use('/warenkorb', require('./routes/cart'));
app.use('/verhandlungen', require('./routes/negotiations'));
app.use('/partner', require('./routes/partners'));
app.use('/support', require('./routes/support'));
app.use('/konto', require('./routes/account'));
app.use('/admin', require('./routes/admin'));
app.use('/api/v1', require('./routes/api'));

app.use((req, res) => res.status(404).render('error', { title: 'Nicht gefunden', message: 'Diese Seite existiert nicht oder ist für Ihren Marktzugang nicht freigegeben.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Fehler', message: err.message });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  init().then(() => app.listen(PORT, () => console.log(`Webshop läuft auf http://localhost:${PORT}`)));
}

module.exports = app;
