# eProcure Shop – Anleitung zur Nutzung und Weiterentwicklung

Lehr-Webshop für das Modul **„eProcurement und Webshops“** (SoSe 2026).
Grundlage: Schaubild *„Architektur funktionaler Anforderungen für eShops“* (Prof. J. Anton Illik).

---

## Inhalt

1. [Schnellstart](#1-schnellstart)
2. [Demo-Zugänge](#2-demo-zugänge)
3. [Die 10 Anforderungen und wo sie umgesetzt sind](#3-die-10-anforderungen-und-wo-sie-umgesetzt-sind)
4. [Geführte Demo (ca. 15 Minuten)](#4-geführte-demo-ca-15-minuten)
5. [Technik-Stack und Begründung](#5-technik-stack-und-begründung)
6. [Projektstruktur](#6-projektstruktur)
7. [Das Projekt bearbeiten – typische Aufgaben](#7-das-projekt-bearbeiten--typische-aufgaben)
8. [Schnittstellen (API, XML, EDIFACT)](#8-schnittstellen-api-xml-edifact)
9. [Tests](#9-tests)
10. [Fehlerbehebung](#10-fehlerbehebung)

---

## 1. Schnellstart

**Voraussetzung:** Node.js ab Version 18 (prüfen mit `node -v`). Eine separate Datenbank wird **nicht** benötigt – die Daten liegen in einer SQLite-Datei unter `data/shop.sqlite`.

```bash
cd eProcurement_und_Webshop_Modul
npm install        # nur beim ersten Mal
npm start          # startet den Shop
```

Danach im Browser öffnen: **http://localhost:3000**

Beim ersten Start werden die Tabellen automatisch angelegt und Demodaten eingespielt.

| Befehl          | Wirkung                                                                 |
|-----------------|-------------------------------------------------------------------------|
| `npm start`     | Shop starten                                                            |
| `npm run dev`   | Shop starten und bei jeder Dateiänderung automatisch neu laden          |
| `npm run reset` | Datenbank löschen und Demodaten neu einspielen (alle Änderungen weg!)   |
| `npm test`      | Automatische Tests aller Kernabläufe ausführen                          |

Anderen Port verwenden: `PORT=8080 npm start`

---

## 2. Demo-Zugänge

Die Zugänge stehen auch auf der Login-Seite unter „Demo-Zugänge“.

| Rolle                            | E-Mail                    | Passwort     | Marktzugang  |
|----------------------------------|---------------------------|--------------|--------------|
| Privatkunde                      | `kunde@mail.de`           | `kunde123`   | Offen        |
| Geschäftskunde (Müller GmbH)     | `einkauf@mueller-gmbh.de` | `b2b123`     | Beschränkt   |
| Konsortialpartner                | `partner@konsortium.de`   | `partner123` | Geschlossen  |
| Neukunde mit offenem Antrag      | `neu@start-up.de`         | `neu123`     | Offen (Antrag auf Beschränkt) |
| Datenpflege-Personal             | `pflege@shop.de`          | `pflege123`  | –            |
| Administrator                    | `admin@shop.de`           | `admin123`   | –            |

**Einladungscodes** (bei Registrierung oder unter *Mein Konto → Marktzugang*):
`KONSORTIUM-2026` (geschlossen), `B2B-FAST-TRACK` (beschränkt). Jeder Code ist nur einmal gültig.

**Testkarten:** `4111 1111 1111 1111` → Zahlung erfolgreich · `4000 0000 0000 0002` → vom Aussteller abgelehnt · jede ungültige Nummer → Luhn-Prüfung schlägt fehl.

**API-Keys:** `demo-b2b-key` (Müller GmbH), `demo-admin-key` (Admin).

---

## 3. Die 10 Anforderungen und wo sie umgesetzt sind

Das Schaubild unterscheidet die **funktionale Ebene** (dynamische Transaktionsphasen) und die **strukturelle Ebene** (strategische & technische Basis). Daraus ergeben sich zehn Anforderungen:

### Funktionale Ebene – Dynamische Transaktionsphasen

| # | Anforderung | Umsetzung im Shop | Code |
|---|---|---|---|
| 1 | **Digitale Logistik-Anbindung (EDI)** | Beim Versand wird automatisch ein EDIFACT-**DESADV** (Lieferavis) mit Sendungsnummer erzeugt, bei Zahlungsfreigabe ein **INVOIC**. Admin kann **ORDERS** an Lieferanten senden. Lieferstatus-Zeitleiste für Kunden. | `src/services/edifact.js`, `src/services/orders.js` (`ship`, `deliver`) |
| 2 | **Zahlungsabwicklung** | Kreditkarte (Luhn-Prüfung, Ablehnung simuliert), PayPal-Sandbox, Vorkasse (Admin bucht Zahlungseingang), Kauf auf Rechnung nur für geprüfte Geschäftskunden. Zahlungsreferenz und -status je Bestellung. | `src/services/payment.js` |
| 3 | **Electronic Customer Care** | FAQ, Ticketsystem mit Bezug zur Bestellung (inkl. Lieferstatus im Ticket sichtbar), Antworten durch Support im Backoffice. | `src/routes/support.js`, `/admin/tickets` |
| 4 | **Matching von Präferenzen** | Kunden hinterlegen Kategorie, Güterart, Budget und Mindestqualität. Jedes Produkt erhält einen Match-Score (0–100 %) mit Begründung; die besten erscheinen als „Für Sie empfohlen“. | `src/services/matching.js` |
| 5 | **Rechtssichere Vertragsaushandlung (Hard Facts)** | Kunde gibt Angebot ab (Preis, Menge, Zahlungs- und Lieferbedingungen). Ein Verhandlungsagent antwortet sofort (Gegenangebot, Annahme, Ablehnung; max. 3 Runden; Mengenrabatt). Bei Einigung entsteht ein **Vertrag** mit allen Hard Facts, der als Bestellung „abgerufen“ werden kann. Kontraktüberwachung mit Warnung bei überfälligen Lieferterminen. | `src/services/negotiation.js`, `src/routes/negotiations.js` |
| 6 | **Bereitstellung von Markt- und Produktdaten** | Volltextsuche (Name, Beschreibung, SKU, Spezifikationen), Filter (Kategorie, Güterart, Lieferant, Qualität, Preis, verhandelbar, lieferbar), Sortierung. Produktseite mit der Informationstabelle aus dem Schaubild: Produktinformationen, Marktteilnehmer, Abwicklung. | `src/services/catalog.js`, `src/routes/shop.js` |
| 7 | **Gezielte Marktpartnersuche** | Suche nach Lieferanten mit Adressdaten, **Bonitätsauskunft** (Rating + Score), **Referenzen**, Zertifizierung; Filter nach Land, Mindestbonität, Branche. | `src/routes/partners.js` |

### Strukturelle Ebene – Strategische & technische Basis

| # | Anforderung | Umsetzung im Shop | Code |
|---|---|---|---|
| 8 | **Objekt-Klassifizierung** | Jedes Produkt ist *digital*, *semi-digital* oder *physisch*. Digital: kein Versand, keine Lagerbuchung, Lizenzschlüssel sofort nach Zahlung. Semi-digital: Versand **und** Lizenzschlüssel. Physisch: Lagerbestand, gewichtsabhängige Versandkosten, DESADV. | `src/services/orders.js` (`needsShipping`, `shippingCost`, `release`) |
| 9 | **Technische & organisatorische Kapazität** | *Technisch:* REST-API mit API-Key, XML-Katalog (an BMEcat angelehnt) für Import/Export, EDIFACT-Empfang und -Versand, Nachrichtenprotokoll. *Organisatorisch:* eigene Rolle **Datenpflege** mit Produktpflege, Datenqualitäts-Score je Produkt (fehlende Felder werden angezeigt) und Nachweis, wer wann gepflegt hat. | `src/routes/api.js`, `src/services/xmlCatalog.js`, `src/routes/admin.js` |
| 10 | **Markt-Zutrittsregelung** | Drei Marktsegmente: **offen** (alle), **beschränkt** (Geschäftskunden nach Prüfung von Firma und USt-IdNr. durch den Admin), **geschlossen** (nur per Einladungscode). Gilt für Shop, Suche, Partnerseiten, API, XML-Export und EDIFACT-Bestellungen. | `src/services/access.js`, `src/middleware/auth.js` |

---

## 4. Geführte Demo (ca. 15 Minuten)

Gut geeignet für eine Präsentation. Vorher `npm run reset` ausführen.

1. **Offener Markt als Gast** – Startseite: Die Marktsegmente „Beschränkt“ und „Geschlossen“ sind ausgegraut. Im Katalog nach `lizenz` suchen und nach Güterart filtern. *(Anf. 6, 10)*
2. **Marktpartner** – *Marktpartner* öffnen, nach „Score ≥ 80“ filtern, TechSupply AG ansehen. *(Anf. 7)*
3. **Digitaler Kauf** – Als `kunde@mail.de` anmelden. Startseite zeigt Empfehlungen mit Match-Score. „Office-Suite Jahreslizenz“ kaufen, PayPal wählen → Lizenzschlüssel erscheint sofort, keine Versandkosten. *(Anf. 2, 4, 8)*
4. **Zahlung abgelehnt** – „Ergonomische Maus“ in den Warenkorb, Kreditkarte `4000 0000 0000 0002` → Ablehnung. Mit `4111 1111 1111 1111` erneut → Bestellung „In Kommissionierung“. *(Anf. 2, 8)*
5. **Support** – Unter *Support* ein Ticket zur Bestellung erstellen. *(Anf. 3)*
6. **Beschränkter Markt & Verhandlung** – Abmelden, als `einkauf@mueller-gmbh.de` anmelden: Der Monitor und das Hydraulikventil sind jetzt sichtbar. Beim „Business-Notebook“ 700 € × 10 Stück anbieten → Gegenangebot. Annehmen → Vertrag entsteht. Vertrag ansehen, dann *Abrufen* mit „Kauf auf Rechnung“. *(Anf. 5, 10)*
7. **Backoffice** – Als `admin@shop.de` anmelden:
   - *Nutzer & Zugang*: Antrag von Nils Neukunde freigeben. *(Anf. 10)*
   - *Bestellungen*: Bestellung öffnen → „Versenden (DESADV senden)“ → EDI-Nachricht „anzeigen“. Danach „Zustellung bestätigen“. *(Anf. 1)*
   - *Tickets*: Ticket aus Schritt 5 beantworten. *(Anf. 3)*
   - *Verhandlungen*: Kontraktüberwachung ansehen. *(Anf. 5)*
8. **Schnittstellen** – *Schnittstellen*: vorgefüllte EDIFACT-ORDERS „Verarbeiten“ → neue Bestellung mit Kanal `edifact`. XML-Import ausführen → neues Produkt „USB-C Dockingstation“. *(Anf. 9)*
9. **Datenpflege** – Als `pflege@shop.de` anmelden. *Produktdaten*: Die Dockingstation hat einen niedrigen Datenqualitäts-Score (Maus darüber zeigt fehlende Felder). Produkt bearbeiten, Kategorie/Lieferant/Gewicht ergänzen → Score steigt. Die Nutzerverwaltung ist für diese Rolle gesperrt. *(Anf. 9)*

---

## 5. Technik-Stack und Begründung

| Baustein | Bibliothek | Wofür |
|---|---|---|
| Webserver | **Express 5** | Routing, Formulare, Sessions – Standard in Node.js |
| Datenbank-Zugriff | **Knex** | SQL-Query-Builder mit Migrationen und Seeds |
| Datenbank | **SQLite** (`better-sqlite3`) | Datei-Datenbank, keine Installation nötig |
| Templates | **EJS** | HTML mit eingebettetem JavaScript, serverseitig gerendert |
| Passwörter | **bcryptjs** | sicheres Hashing |
| XML | **fast-xml-parser** | Katalog-Import und -Export |

**Warum kein fertiges Shop-Framework wie Medusa oder Vendure?**
Beide sind „headless“: Sie liefern nur eine API, das Frontend muss separat gebaut werden. Medusa benötigt zusätzlich PostgreSQL, Redis und Node 20; Vendure bringt GraphQL, NestJS und ein Angular-Admin mit. Für ein Hochschulprojekt auf einem älteren Laptop ist das viel Infrastruktur, und gerade die Kernthemen des Moduls (Verhandlung, EDIFACT, Marktzugang) müssten dort ohnehin als eigene Plugins entwickelt werden.

**Skalierbarkeit ist trotzdem gegeben:**
- **Schichten getrennt:** Routen (HTTP) → Services (Fachlogik) → Datenbank. Die Services sind unabhängig von Express und lassen sich wiederverwenden (z. B. nutzen Web-Kasse und EDIFACT-API denselben `orders.createOrder`).
- **Datenbank austauschbar:** Durch Knex genügt für PostgreSQL `npm install pg` und
  `DB_CLIENT=pg DATABASE_URL=postgres://user:pass@host/db npm start`.
- **Zustandsloser Server:** Mit einem externen Session-Store (z. B. `connect-redis`) können mehrere Instanzen hinter einem Load-Balancer laufen.

---

## 6. Projektstruktur

```
eProcurement_und_Webshop_Modul/
├── ANLEITUNG.md              ← diese Datei
├── package.json              ← Abhängigkeiten und npm-Skripte
├── data/shop.sqlite          ← Datenbank (wird automatisch erzeugt, nicht im Git)
├── public/css/style.css      ← gesamtes Styling
├── test/flows.test.js        ← End-to-End-Tests
└── src/
    ├── app.js                ← Einstiegspunkt: Express, Sessions, Routen, Hilfsfunktionen für Views
    ├── db/
    │   ├── knexfile.js       ← Datenbank-Konfiguration
    │   ├── db.js             ← Verbindung + automatisches Einrichten beim Start
    │   ├── reset.js          ← npm run reset
    │   ├── migrations/       ← Tabellendefinitionen (Datenmodell)
    │   └── seeds/            ← Demodaten
    ├── middleware/auth.js    ← Login, Rollenprüfung, API-Key
    ├── services/             ← FACHLOGIK
    │   ├── access.js         ← Markt-Zutrittsregelung
    │   ├── catalog.js        ← Suche, Filter, Produktdaten
    │   ├── matching.js       ← Präferenz-Matching
    │   ├── negotiation.js    ← Verhandlungsagent + Vertragserzeugung
    │   ├── orders.js         ← Bestellung, Objekt-Klassifizierung, Versand
    │   ├── payment.js        ← Zahlungsarten
    │   ├── edifact.js        ← EDIFACT erzeugen und lesen
    │   └── xmlCatalog.js     ← XML-Katalog
    ├── routes/               ← URLs → ruft Services auf → rendert View
    │   ├── shop.js           ← /, /produkte
    │   ├── cart.js           ← /warenkorb, /warenkorb/kasse
    │   ├── negotiations.js   ← /verhandlungen
    │   ├── partners.js       ← /partner
    │   ├── support.js        ← /support
    │   ├── account.js        ← /konto
    │   ├── auth.js           ← /login, /registrieren
    │   ├── admin.js          ← /admin (Backoffice + Datenpflege)
    │   └── api.js            ← /api/v1 (JSON, XML, EDIFACT)
    └── views/                ← EJS-Templates (HTML)
        ├── partials/         ← Kopf, Fuß, Produktkarte, Navigation …
        ├── account/          ← Kundenkonto
        └── admin/            ← Backoffice
```

**Ablauf einer Anfrage** am Beispiel `GET /produkte?q=maus`:
`app.js` → `routes/shop.js` → `services/catalog.search()` (filtert per `access.js` nach Marktzugang) → `views/products.ejs` → HTML an den Browser.

---

## 7. Das Projekt bearbeiten – typische Aufgaben

> **Tipp:** Während der Entwicklung `npm run dev` verwenden – der Server startet bei jeder Änderung neu. Änderungen an `.ejs`- und `.css`-Dateien sind sofort nach Neuladen im Browser sichtbar.

### 7.1 Texte und Design ändern

- **Texte** stehen direkt in den `.ejs`-Dateien unter `src/views/`. Beispiel: Überschrift der Startseite in `src/views/home.ejs`.
- **Farben** werden zentral oben in `public/css/style.css` unter `:root` definiert (`--primary`, `--green` …).
- **Shopname** „eProcure Shop“: in `src/views/partials/header.ejs` (Logo und `<title>`) und `partials/footer.ejs`.

EJS-Kurzreferenz:
```ejs
<%= wert %>          Ausgabe, HTML-sicher maskiert (Standard verwenden!)
<%- include('x') %>  anderes Template einbinden
<% if (user) { %> … <% } %>   JavaScript-Logik
```

In allen Views verfügbar (aus `app.js`): `user`, `level`, `eur(betrag)`, `date(d)`, `datetime(d)`, `OBJECT_TYPES`, `LEVEL_LABELS`, `STATUS_LABELS`, `cartCount`.

### 7.2 Demodaten ändern (Produkte, Lieferanten, Nutzer)

1. `src/db/seeds/01_demo.js` bearbeiten – z. B. ein weiteres `p({ ... })` im Produkt-Array ergänzen.
2. `npm run reset` ausführen.

Alternativ Produkte ohne Code über das Backoffice (*Produktdaten → Neues Produkt*) oder per XML-Import anlegen.

### 7.3 Ein neues Datenfeld hinzufügen (Beispiel: Herkunftsland eines Produkts)

1. **Migration anlegen** – neue Datei `src/db/migrations/002_origin.js`:
   ```js
   exports.up = (knex) => knex.schema.alterTable('products', (t) => { t.string('origin_country'); });
   exports.down = (knex) => knex.schema.alterTable('products', (t) => { t.dropColumn('origin_country'); });
   ```
   Wird beim nächsten Start automatisch ausgeführt – bestehende Daten bleiben erhalten.
2. **Formular** `src/views/admin/product-form.ejs` – ein Eingabefeld ergänzen:
   ```ejs
   <label>Herkunftsland <input name="origin_country" value="<%= product.origin_country || '' %>"></label>
   ```
3. **Speichern** in `src/routes/admin.js`, Funktion `productData()`: `origin_country: body.origin_country || null,`
4. **Anzeigen** in `src/views/product.ejs` in der Tabelle „Produktinformationen“:
   ```ejs
   <tr><th>Herkunft</th><td><%= product.origin_country || '–' %></td></tr>
   ```
5. Optional: In `completeness()` (admin.js) als Pflichtfeld für den Datenqualitäts-Score aufnehmen, und in `xmlCatalog.js` für Import/Export ergänzen.

### 7.4 Eine neue Seite hinzufügen (Beispiel: „Über uns“)

1. View `src/views/about.ejs` anlegen:
   ```ejs
   <%- include('partials/header') %>
   <section class="panel"><h1>Über uns</h1><p>…</p></section>
   <%- include('partials/footer') %>
   ```
2. Route in `src/routes/shop.js` ergänzen:
   ```js
   router.get('/ueber-uns', (req, res) => res.render('about', { title: 'Über uns' }));
   ```
3. Link in `src/views/partials/header.ejs` in das `<nav>` eintragen.

### 7.5 Verhandlungsstrategie anpassen

Alles in `src/services/negotiation.js`:
- `MAX_ROUNDS` – Anzahl der Verhandlungsrunden.
- `floorPrice()` – Mengenrabatt (aktuell 1 % je 10 Stück, max. 5 % unter die Preisuntergrenze).
- `evaluateOffer()` – Entscheidungslogik: sofortige Annahme ab der Mitte zwischen Untergrenze und Listenpreis, sonst Gegenangebot als Mittelwert aus Kundenangebot und Listenpreis.

Die **Preisuntergrenze** (`min_price`) pflegt man pro Produkt im Backoffice. Nur Produkte mit Haken „verhandelbar“ zeigen das Verhandlungsformular.

### 7.6 Matching anpassen

`src/services/matching.js`, Funktion `score()`: Gewichte (aktuell Kategorie 30, Güterart 20, Budget 30, Qualität 20) und Kriterien. In `rank()` legt `>= 50` fest, ab welchem Score etwas empfohlen wird.

### 7.7 Eine Zahlungsart hinzufügen (Beispiel: Lastschrift)

In `src/services/payment.js`:
1. In `METHODS` eintragen: `lastschrift: { label: 'SEPA-Lastschrift', minLevel: 'restricted' },`
   (`minLevel` bestimmt, ab welchem Marktzugang die Zahlungsart angeboten wird.)
2. In `process()` einen `case 'lastschrift':` ergänzen, der `{ status: 'bezahlt' | 'offen', ref }` zurückgibt.

Die Kasse zeigt die neue Option automatisch an.

### 7.8 Versandkosten ändern

`src/services/orders.js`: `FREE_SHIPPING_FROM` (Grenze für kostenlosen Versand) und die Gewichtsstaffel in `shippingCost()`. Digitale Güter sind immer versandkostenfrei.

### 7.9 Marktzugang eines Produkts oder Nutzers ändern

- **Produkt:** Backoffice → Produktdaten → Feld „Marktsegment“.
- **Nutzer:** Backoffice → Nutzer & Zugang → Zugang auswählen → Speichern.
- **Regel selbst:** `src/services/access.js` – `effectiveLevel()` bestimmt, mit welcher Stufe ein Nutzer den Markt sieht.

### 7.10 Auf PostgreSQL umstellen

```bash
npm install pg
DB_CLIENT=pg DATABASE_URL=postgres://user:passwort@localhost:5432/eprocure npm start
```
Tabellen und Demodaten werden automatisch angelegt.

---

## 8. Schnittstellen (API, XML, EDIFACT)

Übersicht aller Endpunkte: http://localhost:3000/api/v1

Der Marktzugang gilt auch hier: Ohne `X-API-Key` sieht man nur den offenen Markt, mit Key den des jeweiligen Nutzers. Einen eigenen Key erzeugt man unter *Mein Konto → Marktzugang & API*.

```bash
# Produkte als JSON (Filter wie im Shop: q, type, category, …)
curl "http://localhost:3000/api/v1/products?type=digital"

# Katalog als XML (BMEcat-ähnlich), hier mit B2B-Sortiment
curl -H "X-API-Key: demo-b2b-key" http://localhost:3000/api/v1/catalog.xml

# Bestellung als EDIFACT ORDERS senden
cat > orders.edi <<'EOF'
UNA:+.? '
UNB+UNOC:3+MUELLER-ERP+WEBSHOP-EPROC+261029:1200+0001'
UNH+1+ORDERS:D:96A:UN'
BGM+220+PO-4711+9'
NAD+BY+++Müller GmbH'
LIN+1++HW-1002:SA'
QTY+21:10'
UNS+S'
UNT+7+1'
UNZ+1+0001'
EOF
curl -X POST -H "X-API-Key: demo-b2b-key" -H "Content-Type: application/edifact" \
     --data-binary @orders.edi http://localhost:3000/api/v1/orders/edifact

# Status und Lieferavis (nachdem der Admin versendet hat)
curl -H "X-API-Key: demo-b2b-key" http://localhost:3000/api/v1/orders/<ORDER_NO>
curl -H "X-API-Key: demo-b2b-key" http://localhost:3000/api/v1/orders/<ORDER_NO>/desadv
```

**Verwendete EDIFACT-Nachrichten (Version D.96A):**

| Nachricht | Richtung | Wann |
|---|---|---|
| `ORDERS` | ein / aus | Kunde bestellt aus ERP (ein) · Admin sendet Bestellung an Lieferanten (aus) |
| `DESADV` | aus | beim Versand (Lieferavis mit Sendungsnummer) |
| `INVOIC` | aus | bei Zahlungsfreigabe (Rechnung) |

Alle ein- und ausgehenden Nachrichten werden in der Tabelle `edi_messages` protokolliert und sind im Backoffice unter *Schnittstellen* einsehbar.

---

## 9. Tests

```bash
npm test
```

Die Tests in `test/flows.test.js` verwenden eine eigene temporäre Datenbank (die Shop-Datenbank bleibt unberührt) und prüfen u. a.: Marktzugang je Rolle, Suche, digitale und physische Bestellung, Zahlungsregeln, Verhandlung bis zum Vertragsabruf, EDIFACT-API mit DESADV, XML-Import/Export, Registrierung und Freigabe, Support-Tickets, Produktpflege sowie das fehlerfreie Rendern aller Seiten.

Nach eigenen Änderungen einfach erneut `npm test` ausführen. Eigene Tests ergänzt man nach dem gleichen Muster (`test('Beschreibung', async () => { … })`).

---

## 10. Fehlerbehebung

| Problem | Lösung |
|---|---|
| `Error: listen EADDRINUSE :::3000` | Port belegt (läuft der Shop schon?). Anderes Terminal schließen oder `PORT=3001 npm start`. |
| Seiten zeigen alte oder kaputte Daten | `npm run reset` (setzt alles auf Demodaten zurück). |
| `Cannot find module …` | `npm install` ausführen. |
| `better-sqlite3` lässt sich nach einem Node-Update nicht laden | `npm rebuild better-sqlite3` |
| Nach Neustart ist man ausgeloggt / Warenkorb leer | Gewollt: Sessions liegen im Arbeitsspeicher. Für den Produktivbetrieb einen Session-Store (z. B. `connect-sqlite3`, `connect-redis`) und eine feste `SESSION_SECRET`-Umgebungsvariable verwenden. |
| Produkt ist im Shop nicht sichtbar | Ist es „aktiv“? Passt das Marktsegment zum eigenen Zugang? (Backoffice → Produktdaten) |

**Hinweis:** Es handelt sich um ein Lehrprojekt. Zahlungen sind simuliert, es werden keine echten E-Mails oder EDI-Nachrichten versendet.
