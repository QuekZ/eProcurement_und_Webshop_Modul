const bcrypt = require('bcryptjs');

// Alles in einer Transaktion: ein abgebrochener Start hinterlässt keine halbe Datenbank.
exports.seed = (db) => db.transaction(async (knex) => {
  for (const t of ['edi_messages', 'ticket_messages', 'tickets', 'contracts', 'order_items', 'orders',
    'negotiation_messages', 'negotiations', 'products', 'categories', 'suppliers', 'invite_codes', 'users']) {
    await knex(t).del();
  }

  const hash = (pw) => bcrypt.hashSync(pw, 8);
  await knex('users').insert([
    { id: 1, email: 'admin@shop.de', password_hash: hash('admin123'), name: 'Anna Admin', role: 'admin', access_level: 'closed', requested_level: 'closed', api_key: 'demo-admin-key' },
    { id: 2, email: 'pflege@shop.de', password_hash: hash('pflege123'), name: 'Daniel Datenpflege', role: 'datapfleger', access_level: 'closed', requested_level: 'closed' },
    { id: 3, email: 'kunde@mail.de', password_hash: hash('kunde123'), name: 'Paula Privat', address: 'Hauptstr. 1, 10115 Berlin', access_level: 'open', requested_level: 'open',
      preferences: JSON.stringify({ category_id: 3, object_type: 'digital', max_price: 100, min_quality: 'Standard' }) },
    { id: 4, email: 'einkauf@mueller-gmbh.de', password_hash: hash('b2b123'), name: 'Bernd Beschaffung', company: 'Müller GmbH', vat_id: 'DE123456789',
      address: 'Industriestr. 5, 70173 Stuttgart', access_level: 'restricted', requested_level: 'restricted', api_key: 'demo-b2b-key',
      preferences: JSON.stringify({ category_id: 1, object_type: 'physical', max_price: 500, min_quality: 'Premium' }) },
    { id: 5, email: 'partner@konsortium.de', password_hash: hash('partner123'), name: 'Clara Konsortium', company: 'Konsortium AG',
      address: 'Am Hafen 9, 20457 Hamburg', access_level: 'closed', requested_level: 'closed' },
    { id: 6, email: 'neu@start-up.de', password_hash: hash('neu123'), name: 'Nils Neukunde', company: 'Start-up UG', vat_id: 'DE987654321',
      address: 'Gründerweg 3, 80331 München', access_level: 'open', requested_level: 'restricted', approved: false },
  ]);

  await knex('invite_codes').insert([
    { code: 'KONSORTIUM-2026', access_level: 'closed' },
    { code: 'B2B-FAST-TRACK', access_level: 'restricted' },
  ]);

  await knex('categories').insert([
    { id: 1, name: 'Büro & Hardware' },
    { id: 2, name: 'Industriebedarf' },
    { id: 3, name: 'Software & Lizenzen' },
    { id: 4, name: 'Weiterbildung' },
  ]);

  await knex('suppliers').insert([
    { id: 1, name: 'TechSupply AG', street: 'Datenallee 12', city: 'München', country: 'DE', email: 'vertrieb@techsupply.de',
      credit_rating: 'AA', credit_score: 88, references_text: 'Siemens, Bosch, Hochschule München', industries: 'Hardware, IT', certified: true },
    { id: 2, name: 'SoftLicense GmbH', street: 'Cloudweg 3', city: 'Berlin', country: 'DE', email: 'sales@softlicense.de',
      credit_rating: 'A', credit_score: 79, references_text: 'Deutsche Bahn, Charité', industries: 'Software, Lizenzen', certified: true },
    { id: 3, name: 'Industria Components S.r.l.', street: 'Via Roma 44', city: 'Mailand', country: 'IT', email: 'info@industria.it',
      credit_rating: 'BBB', credit_score: 64, references_text: 'Fiat, Pirelli', industries: 'Industriebedarf, Maschinenbau', certified: false },
    { id: 4, name: 'EduMedia Verlag', street: 'Buchplatz 1', city: 'Köln', country: 'DE', email: 'kontakt@edumedia.de',
      credit_rating: 'A', credit_score: 75, references_text: 'TH Köln, IHK', industries: 'Weiterbildung, Medien', certified: true },
  ]);

  const p = (o) => ({ negotiable: false, stock: 100, quality: 'Standard', access_level: 'open', delivery_days: 3, weight_kg: 0, ...o, specs: JSON.stringify(o.specs || {}) });
  await knex('products').insert([
    p({ sku: 'HW-1001', name: 'Business-Notebook 14"', category_id: 1, supplier_id: 1, object_type: 'physical', price: 899, min_price: 790, negotiable: true, stock: 40,
      quality: 'Premium', weight_kg: 1.4, usage_purpose: 'Mobiles Arbeiten im Büro', description: 'Robustes Notebook für den professionellen Einsatz.',
      specs: { CPU: '8 Kerne', RAM: '16 GB', SSD: '512 GB', Garantie: '3 Jahre' } }),
    p({ sku: 'HW-1002', name: 'Ergonomische Maus', category_id: 1, supplier_id: 1, object_type: 'physical', price: 39.9, stock: 500, weight_kg: 0.1,
      usage_purpose: 'Arbeitsplatzausstattung', description: 'Vertikale Maus zur Entlastung des Handgelenks.', specs: { Anschluss: 'USB/Bluetooth', DPI: '1600' } }),
    p({ sku: 'HW-1003', name: '27" Monitor 4K', category_id: 1, supplier_id: 1, object_type: 'physical', price: 349, min_price: 299, negotiable: true, stock: 60,
      quality: 'Premium', weight_kg: 5.2, usage_purpose: 'Bildbearbeitung, CAD', description: 'Farbtreuer 4K-Monitor.', specs: { Auflösung: '3840x2160', Panel: 'IPS' },
      access_level: 'restricted' }),
    p({ sku: 'IND-2001', name: 'Hydraulikventil DN25', category_id: 2, supplier_id: 3, object_type: 'physical', price: 189, min_price: 150, negotiable: true, stock: 120,
      quality: 'Premium', weight_kg: 2.3, delivery_days: 7, usage_purpose: 'Hydraulikanlagen', description: 'Industrietaugliches Wegeventil.',
      specs: { Nenndruck: '315 bar', Material: 'Stahl verzinkt', Norm: 'ISO 4401' }, access_level: 'restricted' }),
    p({ sku: 'IND-2002', name: 'Sondermaschine Rahmenvertrag', category_id: 2, supplier_id: 3, object_type: 'physical', price: 24900, min_price: 21000, negotiable: true,
      stock: 3, quality: 'Premium', weight_kg: 800, delivery_days: 60, usage_purpose: 'Serienfertigung', description: 'Individuell konfigurierte Fertigungsanlage – nur für Konsortialpartner.',
      specs: { Leistung: '22 kW', Steuerung: 'SPS S7' }, access_level: 'closed' }),
    p({ sku: 'SW-3001', name: 'Office-Suite Jahreslizenz', category_id: 3, supplier_id: 2, object_type: 'digital', price: 69, stock: 9999,
      usage_purpose: 'Textverarbeitung, Tabellen', description: 'Lizenzschlüssel per Download, sofort verfügbar.', specs: { Laufzeit: '12 Monate', Geräte: '5' } }),
    p({ sku: 'SW-3002', name: 'ERP-Modul Einkauf (10 Nutzer)', category_id: 3, supplier_id: 2, object_type: 'digital', price: 4800, min_price: 3900, negotiable: true,
      stock: 9999, quality: 'Premium', usage_purpose: 'Elektronische Beschaffung', description: 'eProcurement-Modul mit Katalog- und Freigabeworkflow.',
      specs: { Nutzer: '10', Schnittstellen: 'BMEcat, EDIFACT, cXML' }, access_level: 'restricted' }),
    p({ sku: 'SW-3003', name: 'Antivirus Pro', category_id: 3, supplier_id: 2, object_type: 'digital', price: 29.9, stock: 9999, quality: 'Basic',
      usage_purpose: 'IT-Sicherheit', description: 'Virenschutz für 1 Gerät.', specs: { Laufzeit: '12 Monate' } }),
    p({ sku: 'SD-4001', name: 'Fachbuch eProcurement + E-Book', category_id: 4, supplier_id: 4, object_type: 'semi_digital', price: 49.9, stock: 200, weight_kg: 0.8,
      usage_purpose: 'Studium & Weiterbildung', description: 'Gedrucktes Buch inkl. E-Book-Zugangscode.', specs: { Seiten: '420', Auflage: '3.' } }),
    p({ sku: 'SD-4002', name: 'Software-Box mit Datenträger', category_id: 3, supplier_id: 2, object_type: 'semi_digital', price: 119, stock: 80, weight_kg: 0.4,
      usage_purpose: 'Offline-Installation', description: 'Physische Box mit USB-Stick und Lizenzschlüssel.', specs: { Medium: 'USB 32 GB' } }),
    p({ sku: 'ED-5001', name: 'Online-Seminar EDI-Grundlagen', category_id: 4, supplier_id: 4, object_type: 'digital', price: 149, stock: 9999,
      usage_purpose: 'Schulung Datenpflege-Personal', description: 'Zugang zu 6 Video-Lektionen über XML und EDIFACT.', specs: { Dauer: '6 h', Zertifikat: 'ja' } }),
  ]);

  await knex('tickets').insert({ id: 1, user_id: 3, subject: 'Wie aktiviere ich meine Lizenz?', category: 'Produktfrage', status: 'beantwortet' });
  await knex('ticket_messages').insert([
    { ticket_id: 1, author: 'kunde', body: 'Ich habe die Office-Suite gekauft, wo finde ich den Schlüssel?' },
    { ticket_id: 1, author: 'support', body: 'Den Lizenzschlüssel finden Sie unter „Mein Konto → Bestellungen“ direkt nach Zahlungseingang.' },
  ]);
});
