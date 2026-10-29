exports.up = async (knex) => {
  // Marktteilnehmer: Kunden, Administratoren und Datenpflege-Personal
  await knex.schema.createTable('users', (t) => {
    t.increments('id');
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.string('name').notNullable();
    t.string('company');
    t.string('vat_id');
    t.string('address');
    t.enu('role', ['customer', 'datapfleger', 'admin']).defaultTo('customer');
    // Markt-Zutritt: open < restricted < closed
    t.enu('access_level', ['open', 'restricted', 'closed']).defaultTo('open');
    t.enu('requested_level', ['open', 'restricted', 'closed']).defaultTo('open');
    t.boolean('approved').defaultTo(true);
    t.string('api_key').unique();
    t.text('preferences'); // JSON: Präferenzen für das Matching
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('invite_codes', (t) => {
    t.string('code').primary();
    t.enu('access_level', ['restricted', 'closed']).notNullable();
    t.integer('used_by').references('users.id');
  });

  // Marktteilnehmer auf Anbieterseite (Adressdaten, Bonität, Referenzen)
  await knex.schema.createTable('suppliers', (t) => {
    t.increments('id');
    t.string('name').notNullable();
    t.string('street');
    t.string('city');
    t.string('country');
    t.string('email');
    t.string('credit_rating'); // z. B. AAA, AA, A, BBB, BB
    t.integer('credit_score'); // 0–100
    t.text('references_text');
    t.string('industries');
    t.boolean('certified').defaultTo(false);
  });

  await knex.schema.createTable('categories', (t) => {
    t.increments('id');
    t.string('name').notNullable();
  });

  await knex.schema.createTable('products', (t) => {
    t.increments('id');
    t.string('sku').notNullable().unique();
    t.string('name').notNullable();
    t.text('description');
    t.integer('category_id').references('categories.id');
    t.integer('supplier_id').references('suppliers.id');
    // Objekt-Klassifizierung
    t.enu('object_type', ['digital', 'semi_digital', 'physical']).notNullable();
    t.decimal('price', 10, 2).notNullable();
    t.decimal('min_price', 10, 2); // Untergrenze für Verhandlungen
    t.boolean('negotiable').defaultTo(false);
    t.integer('stock').defaultTo(0);
    t.text('specs'); // JSON: Spezifikationen
    t.string('usage_purpose');
    t.enu('quality', ['Basic', 'Standard', 'Premium']).defaultTo('Standard');
    t.decimal('weight_kg', 8, 2).defaultTo(0);
    t.integer('delivery_days').defaultTo(3);
    t.enu('access_level', ['open', 'restricted', 'closed']).defaultTo('open');
    t.boolean('active').defaultTo(true);
    t.integer('updated_by').references('users.id');
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('negotiations', (t) => {
    t.increments('id');
    t.integer('user_id').references('users.id').notNullable();
    t.integer('product_id').references('products.id').notNullable();
    t.enu('status', ['offen', 'gegenangebot', 'angenommen', 'abgelehnt']).defaultTo('offen');
    t.integer('quantity').notNullable();
    t.decimal('current_price', 10, 2).notNullable();
    t.string('payment_terms');
    t.string('delivery_terms');
    t.integer('rounds').defaultTo(0);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('negotiation_messages', (t) => {
    t.increments('id');
    t.integer('negotiation_id').references('negotiations.id').notNullable();
    t.enu('author', ['kunde', 'anbieter']).notNullable();
    t.decimal('price', 10, 2);
    t.integer('quantity');
    t.text('message');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('orders', (t) => {
    t.increments('id');
    t.string('order_no').notNullable().unique();
    t.integer('user_id').references('users.id');
    t.string('channel').defaultTo('webshop'); // webshop | edifact | api
    t.enu('status', ['neu', 'bezahlt', 'in_kommissionierung', 'versandt', 'zugestellt', 'abgeschlossen', 'storniert']).defaultTo('neu');
    t.string('payment_method');
    t.enu('payment_status', ['offen', 'bezahlt', 'fehlgeschlagen']).defaultTo('offen');
    t.string('payment_ref');
    t.decimal('subtotal', 10, 2);
    t.decimal('shipping_cost', 10, 2).defaultTo(0);
    t.decimal('total', 10, 2);
    t.string('shipping_address');
    t.string('carrier');
    t.string('tracking_no');
    t.integer('contract_id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('order_items', (t) => {
    t.increments('id');
    t.integer('order_id').references('orders.id').notNullable();
    t.integer('product_id').references('products.id');
    t.string('sku');
    t.string('name');
    t.string('object_type');
    t.integer('quantity');
    t.decimal('unit_price', 10, 2);
    t.string('license_key'); // für digitale / semi-digitale Güter
  });

  // Vertrag mit den "Hard Facts" der Verhandlung
  await knex.schema.createTable('contracts', (t) => {
    t.increments('id');
    t.string('contract_no').notNullable().unique();
    t.integer('negotiation_id').references('negotiations.id');
    t.integer('user_id').references('users.id');
    t.integer('product_id').references('products.id');
    t.integer('quantity');
    t.decimal('unit_price', 10, 2);
    t.decimal('total', 10, 2);
    t.string('payment_terms');
    t.string('delivery_terms');
    t.date('delivery_date');
    t.enu('status', ['aktiv', 'abgerufen', 'erfuellt']).defaultTo('aktiv');
    t.integer('order_id').references('orders.id');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('tickets', (t) => {
    t.increments('id');
    t.integer('user_id').references('users.id');
    t.integer('order_id').references('orders.id');
    t.string('subject');
    t.string('category');
    t.enu('status', ['offen', 'beantwortet', 'geschlossen']).defaultTo('offen');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('ticket_messages', (t) => {
    t.increments('id');
    t.integer('ticket_id').references('tickets.id').notNullable();
    t.enu('author', ['kunde', 'support']).notNullable();
    t.text('body');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // Protokoll aller Nachrichten über die Schnittstellen (EDIFACT, XML, JSON)
  await knex.schema.createTable('edi_messages', (t) => {
    t.increments('id');
    t.enu('direction', ['in', 'out']).notNullable();
    t.string('format'); // EDIFACT | XML | JSON
    t.string('message_type'); // ORDERS | DESADV | INVOIC | CATALOG
    t.string('reference');
    t.text('content');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async (knex) => {
  for (const t of ['edi_messages', 'ticket_messages', 'tickets', 'contracts', 'order_items', 'orders',
    'negotiation_messages', 'negotiations', 'products', 'categories', 'suppliers', 'invite_codes', 'users']) {
    await knex.schema.dropTableIfExists(t);
  }
};
