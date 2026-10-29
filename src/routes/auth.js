const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db/db');

router.get('/login', (req, res) => res.render('login', { title: 'Anmelden', next: req.query.next || '/' }));

router.post('/login', async (req, res) => {
  const user = await db('users').where({ email: (req.body.email || '').trim().toLowerCase() }).first();
  if (!user || !bcrypt.compareSync(req.body.password || '', user.password_hash)) {
    return res.status(401).render('login', { title: 'Anmelden', next: req.body.next, error: 'E-Mail oder Passwort falsch.' });
  }
  req.session.regenerate(() => {
    req.session.userId = user.id;
    const target = req.body.next && req.body.next.startsWith('/') && !req.body.next.startsWith('//') ? req.body.next : '/';
    res.redirect(user.role === 'customer' ? target : '/admin');
  });
});

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

router.get('/registrieren', (req, res) => res.render('register', { title: 'Registrieren', form: {} }));

// Registrierung mit Marktzugangsantrag: offen (sofort), beschränkt (Prüfung) oder per Einladungscode.
router.post('/registrieren', async (req, res) => {
  const form = req.body;
  const email = (form.email || '').trim().toLowerCase();
  const fail = (error) => res.status(400).render('register', { title: 'Registrieren', form, error });

  if (!email || !form.name || (form.password || '').length < 6) return fail('Bitte Name, E-Mail und ein Passwort (mind. 6 Zeichen) angeben.');
  if (await db('users').where({ email }).first()) return fail('Diese E-Mail ist bereits registriert.');

  let accessLevel = 'open';
  let requested = form.account_type === 'business' ? 'restricted' : 'open';
  let invite = null;
  if (form.invite_code) {
    invite = await db('invite_codes').where({ code: form.invite_code.trim() }).whereNull('used_by').first();
    if (!invite) return fail('Der Einladungscode ist ungültig oder wurde bereits verwendet.');
    accessLevel = invite.access_level;
    requested = invite.access_level;
  }
  if (requested === 'restricted' && !invite && (!form.company || !form.vat_id)) {
    return fail('Geschäftskunden benötigen Firmenname und USt-IdNr. für die Prüfung.');
  }

  const [row] = await db('users').insert({
    email,
    name: form.name,
    company: form.company || null,
    vat_id: form.vat_id || null,
    address: form.address || null,
    password_hash: bcrypt.hashSync(form.password, 10),
    access_level: accessLevel,
    requested_level: requested,
    approved: requested === accessLevel,
  }).returning('id');
  const id = typeof row === 'object' ? row.id : row;
  if (invite) await db('invite_codes').where({ code: invite.code }).update({ used_by: id });

  req.session.userId = id;
  req.session.flash = requested !== accessLevel
    ? { type: 'info', text: 'Konto angelegt. Ihr Antrag auf beschränkten Marktzugang wird geprüft – bis dahin sehen Sie den offenen Markt.' }
    : { type: 'success', text: `Willkommen! Ihr Marktzugang: ${accessLevel}.` };
  res.redirect('/');
});

module.exports = router;
