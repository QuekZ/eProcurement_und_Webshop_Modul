# eProcure Shop

Ein B2B/B2C-Webshop mit eProcurement-Funktionen, entwickelt als Hochschulprojekt im Modul **„eProcurement und Webshops“** (SoSe 2026).

Der Shop setzt die zehn funktionalen Anforderungen aus dem Schaubild *„Architektur funktionaler Anforderungen für eShops“* (Prof. J. Anton Illik) um: von der Produktsuche über die elektronische Preisverhandlung und den Vertragsabschluss bis zu Zahlung, Logistik und Kundenservice. Dazu kommen EDIFACT- und XML-Schnittstellen sowie ein dreistufiger Marktzugang.

---

## Funktionen

### Dynamische Transaktionsphasen (funktionale Ebene)

| Bereich | Funktionen |
|---|---|
| **Informations- & Suchfunktionen** | Volltextsuche, Filter (Kategorie, Güterart, Lieferant, Qualität, Preis), Produktdatenblätter, Marktpartnersuche mit Bonitätsauskunft und Referenzen |
| **Verhandlungs- & Abschlusslogik** | Präferenz-Matching mit Match-Score, automatisierter Verhandlungsagent (Angebot ↔ Gegenangebot), Vertrag mit allen Hard Facts, Kontraktüberwachung |
| **Abwicklungs- & Supportsysteme** | Zahlungsabwicklung (Kreditkarte, PayPal, Vorkasse, Rechnung; simuliert), Logistik mit EDIFACT-Lieferavis, Sendungsverfolgung, Ticketsystem und FAQ |

### Strategische & technische Basis (strukturelle Ebene)

| Bereich | Funktionen |
|---|---|
| **Objekt-Klassifizierung** | Digitale (Lizenzschlüssel), semi-digitale (Versand + Lizenz) und physische Güter (Lager, Versand) werden jeweils eigens abgewickelt |
| **Technische & organisatorische Kapazität** | REST-API mit API-Key, XML-Katalogimport und -export (an BMEcat angelehnt), EDIFACT `ORDERS` / `DESADV` / `INVOIC`, Rolle *Datenpflege* mit Datenqualitäts-Score |
| **Markt-Zutrittsregelung** | Offener Markt (alle), beschränkter Markt (geprüfte Geschäftskunden), geschlossener Markt (nur auf Einladung) |

Dazu gibt es ein **Backoffice** für Bestellungen, Verhandlungen, Tickets, Nutzerfreigaben, Produktpflege und Schnittstellen.

---

## Tech-Stack

| Komponente | Technologie |
|---|---|
| Laufzeitumgebung | [Node.js](https://nodejs.org/) ≥ 18 |
| Webserver | [Express 5](https://expressjs.com/) |
| Datenbank | SQLite über [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), PostgreSQL optional |
| Datenbank-Zugriff | [Knex.js](https://knexjs.org/) (Query-Builder, Migrationen, Seeds) |
| Templates | [EJS](https://ejs.co/) (serverseitiges Rendering) |
| Sicherheit | [bcryptjs](https://github.com/dcodeIO/bcrypt.js) (Passwort-Hashing), Sessions über express-session |
| XML | [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) |
| Tests | Node.js Test Runner (`node:test`), keine weiteren Abhängigkeiten |

Die Architektur trennt drei Schichten: **Routen → Services (Fachlogik) → Datenbank**. Mit Knex lässt sich die Datenbank ohne Codeänderung auf PostgreSQL umstellen.

---

## Installation & Start

**Voraussetzungen:** [Node.js](https://nodejs.org/) ab Version 18 und Git. Eine separate Datenbank ist nicht nötig.

```bash
git clone https://github.com/QuekZ/eProcurement_und_Webshop_Modul.git
cd eProcurement_und_Webshop_Modul
npm install
npm start
```

Danach im Browser öffnen: **http://localhost:3000**

Beim ersten Start legt der Shop die Datenbank (`data/shop.sqlite`) automatisch an und spielt Demodaten ein.

### Verfügbare Befehle

| Befehl | Beschreibung |
|---|---|
| `npm start` | Shop starten |
| `npm run dev` | Entwicklungsmodus: Neustart bei Dateiänderungen |
| `npm run reset` | Datenbank auf die Demodaten zurücksetzen |
| `npm test` | Automatische End-to-End-Tests ausführen |

### Demo-Zugänge

| Rolle | E-Mail | Passwort |
|---|---|---|
| Privatkunde (offener Markt) | `kunde@mail.de` | `kunde123` |
| Geschäftskunde (beschränkter Markt) | `einkauf@mueller-gmbh.de` | `b2b123` |
| Konsortialpartner (geschlossener Markt) | `partner@konsortium.de` | `partner123` |
| Datenpflege | `pflege@shop.de` | `pflege123` |
| Administrator | `admin@shop.de` | `admin123` |

Testkreditkarte: `4111 1111 1111 1111`. Alle weiteren Testdaten stehen in der [Anleitung](ANLEITUNG.md#2-demo-zugänge).

---

## Projektstruktur

```
├── public/css/        Styling
├── src/
│   ├── app.js         Einstiegspunkt
│   ├── db/            Datenbank-Konfiguration, Migrationen, Demodaten
│   ├── middleware/    Login, Rollen, API-Key
│   ├── services/      Fachlogik (Suche, Matching, Verhandlung, Bestellung, Zahlung, EDIFACT, XML, Marktzugang)
│   ├── routes/        URL-Endpunkte (Shop, Konto, Backoffice, API)
│   └── views/         EJS-Templates
└── test/              End-to-End-Tests
```

---

## API (Kurzüberblick)

```bash
curl http://localhost:3000/api/v1/products                                  # Produkte als JSON
curl -H "X-API-Key: demo-b2b-key" http://localhost:3000/api/v1/catalog.xml  # Katalog als XML
curl -X POST -H "X-API-Key: demo-b2b-key" -H "Content-Type: application/edifact" \
     --data-binary @orders.edi http://localhost:3000/api/v1/orders/edifact  # EDIFACT-Bestellung
```

Alle Endpunkte sind unter `GET /api/v1` aufgelistet.

---

## Dokumentation

Die ausführliche **[ANLEITUNG.md](ANLEITUNG.md)** enthält:

- die Zuordnung der 10 Anforderungen zum Code,
- eine geführte Demo für Präsentationen,
- Schritt-für-Schritt-Beispiele zum Erweitern des Projekts (neue Felder, Seiten, Zahlungsarten, Verhandlungsstrategie),
- die Umstellung auf PostgreSQL,
- Hinweise zur Fehlerbehebung.

---

## Hinweis

Dies ist ein **Lehrprojekt**. Zahlungen, Versanddienstleister und der EDI-Nachrichtenaustausch sind simuliert. Es werden keine echten Transaktionen ausgeführt und keine E-Mails versendet.
