const { db } = require('../db/db');
const { effectiveLevel } = require('../services/access');

// Lädt den angemeldeten Nutzer bei jeder Anfrage frisch aus der Datenbank,
// damit Freischaltungen durch den Admin sofort wirken.
async function loadUser(req, res, next) {
  try {
    req.user = req.session.userId ? await db('users').where({ id: req.session.userId }).first() : null;
    req.level = effectiveLevel(req.user);
    res.locals.user = req.user;
    res.locals.level = req.level;
    next();
  } catch (err) {
    next(err);
  }
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  req.session.flash = { type: 'info', text: 'Bitte melden Sie sich an.' };
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    res.status(403).render('error', { title: 'Kein Zugriff', message: 'Für diesen Bereich fehlen Ihnen die Berechtigungen.' });
  };
}

// API-Zugriff über den Header X-API-Key (für B2B-Systeme / EDI-Partner).
async function apiKey(req, res, next) {
  const key = req.get('X-API-Key');
  req.user = key ? await db('users').where({ api_key: key }).first() : null;
  req.level = effectiveLevel(req.user);
  next();
}

module.exports = { loadUser, requireLogin, requireRole, apiKey };
