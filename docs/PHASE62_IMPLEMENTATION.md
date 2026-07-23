# Faza 6.2 — Gjurmueshmëria sipas rrjedhës reale

Rrjedha operative:

`Ferma → Bima → Formulari i Peshës → Kontroll Cilësie → Faturë Blerje → Fletë-Hyrje → Lot RAW/Etiketë 58 mm → Proces 1..N → Produkt i Gatshëm → Porosi Klienti/Lot Final → Kontroll Cilësie → Faturë Shitje → Ngarkesë/Fletë-Dalje → Arkëtim/Bankë`

## Rregulla të implementuara

- Ferma dhe Bima shfaqen në një regjistër të përbashkët.
- Formulari i Peshës ruan rreshtat realë: Nr. Ambalazheve, KG, Peshorja/Ambalazhi dhe Pesha Neto.
- Dosja hapet nga Formulari Draft dhe ruan snapshot-in e origjinës.
- Fatura e Blerjes kërkon Kontroll Cilësie të aprovuar.
- Fletë-Hyrja kërkon Faturën e Blerjes dhe krijon atomikisht stokun, lotin RAW dhe etiketën.
- Etiketa është termike 58 mm me blloqet AMB dhe PESHË NETO.
- Dosja ka timeline, link dokumentesh, Print, PDF të bashkuar dhe Excel me sheet të veçantë.
- Çdo veprim ruan user-in, datën/orën e serverit, IP-në, Device ID, platformën dhe rezultatin.
- Auditimi është append-only dhe lidhet me hash me eventin paraardhës.

## Identifikimi i pajisjes

- Web/PWA: Device ID i qëndrueshëm i krijuar dhe ruajtur në pajisje.
- Desktop/EXE: i njëjti header pranon edhe serialin real të pajisjes kur shell-i desktop e ekspozon me leje.
- Browser-i i zakonshëm nuk ka leje të lexojë serialin fizik të PC-së.
