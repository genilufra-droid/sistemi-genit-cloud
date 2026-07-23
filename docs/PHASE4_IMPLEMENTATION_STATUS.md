# Faza 4 — Statusi i implementimit

## Blloku 4.1 — Loti automatik nga Peshimi/Pranimi

Status: Në testim CI.

Implementuar në PostgreSQL:

- Ferma/Zona e origjinës.
- Parcela/Zona e mbledhjes.
- Sekuenca unike e lotit sipas kompanisë, artikullit dhe datës.
- Loti RAW automatik.
- Lëvizjet e lotit.
- Kontrolli i cilësisë.
- Genealogjia bazë e proceseve.
- Tabelat bazë të shpenzimeve, logjistikës, ngarkesave dhe aseteve.

Endpoint-i `POST /api/weights/:id/post-receipt` poston në një transaksion:

1. Formularin e peshës.
2. Fletë-Hyrjen `PURCHASE_RECEIPT`.
3. Rreshtin e Fletë-Hyrjes.
4. Lotin automatik RAW.
5. Lëvizjen `RECEIPT_IN` të lotit.
6. Hyrjen e stokut.
7. Lidhjen fermer → fermë → parcelë → peshim → fletë-hyrje → lot.
8. Audit Log dhe Cloud Change Events.

Postimi i dyfishtë bllokohet me lock transaksional dhe statusin e peshimit.

## Numërimi automatik

- Lot RAW: `RAW-{ARTIKULLI}-{YYYYMMDD}-{NNNN}`.
- Fletë-Hyrje: `FH-{YYYY}-{NNNNNN}`.
- Kontroll cilësie: `QC-{YYYY}-{NNNNNN}`.

## Gjurmueshmëria 360°

Endpoint-i `GET /api/trace/lots/:id/360` kthen:

- lotin;
- artikullin;
- fermerin/furnitorin;
- fermën dhe parcelën;
- peshimin;
- Fletë-Hyrjen;
- lëvizjet e lotit;
- kontrollet e cilësisë;
- proceset ku është përdorur;
- ngarkesat ku është përfshirë.

## Hapi pasues

Pas kalimit të testit PostgreSQL:

1. Ndërfaqja e Peshimit merr fushat Fermer, Fermë/Zonë, Parcelë dhe Datë Mbledhjeje.
2. Butoni `Konfirmo` përdor vetëm postimin traceable.
3. `+ Lot i Ri` hiqet nga përdorimi normal.
4. Kartela 360° merr veprimet Shiko, Print, PDF dhe Excel.
5. Implementohet Urdhri i Punës që krijon automatikisht lotin PROCESSED.
6. Implementohet Paketimi që krijon lotin PKG, kutitë dhe paletat.
7. Implementohet Ngarkesa/Eksport me kamion, CMR, lotet dhe klientin.
