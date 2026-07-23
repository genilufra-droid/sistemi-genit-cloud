# Mbyllja e Sistemi Genit Cloud

Sistemi konsiderohet ERP i mbyllur vetëm kur të gjitha pikat më poshtë janë të implementuara, të testuara në PostgreSQL dhe të verifikuara në browser.

## Porta 1 — Gjurmueshmëria fizike
- Peshim/Pranim → lot RAW automatik
- Kontroll cilësie
- Urdhër Pune → lot PROCESSED
- Paketim → lot PACKAGED, pako, kuti dhe paleta
- Ngarkesë eksporti → dalje stoku dhe lidhje me klient/faturë
- Recall para dhe mbrapa deri te parcela

## Porta 2 — Dokumentet tregtare
- Blerje, Fletë-Hyrje, Faturë Blerjeje
- Shitje, Fletë-Dalje, Faturë Shitjeje
- Preview = Print = PDF = Excel .xlsx sipas modeleve të miratuara
- Snapshot i dokumentit të postuar

## Porta 3 — Financat
- Detyrime klient/furnitor
- Mandat Arkëtimi dhe Mandat Pagese
- Ditari i Arkës
- Derdhje Arke në Bankë
- Posta e Bankës dhe rakordimi
- Shpenzime dhe qendra kostoje

## Porta 4 — Operacionet
- Logjistikë, karburant, kilometra, itinerare, riparime dhe mirëmbajtje
- Ngarkesa dhe eksport, CMR, packing list, dokumente doganore dhe dorëzim
- Asete, investime, amortizim, mirëmbajtje dhe downtime

## Porta 5 — Raportet
- Raporte operative dhe financiare server-side
- Minimumi 15 raporte të logjistikës
- Raporte të ngarkesave/eksportit
- Raporte asete/investime
- PDF, Print dhe Excel real për çdo raport

## Porta 6 — Kontrollet globale
- Kërko ose + Shto të ri kudo
- Role dhe leje
- Multi-company dhe multi-warehouse
- Audit Log
- Bllokim postimi të dyfishtë
- Idempotency, concurrency dhe transaksione atomike
- Backup/restore dhe test rikuperimi
- Test i plotë multi-user në pajisje të ndryshme

Asnjë modul vetëm me menu, tabelë bosh ose placeholder nuk konsiderohet i përfunduar.