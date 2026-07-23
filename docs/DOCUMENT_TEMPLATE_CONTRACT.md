# Kontrata e pandryshueshme e formateve të dokumenteve

Kjo kontratë është detyruese për **Sistemi Genit**. Modelet e dërguara nga përdoruesi janë referenca përfundimtare e pamjes, strukturës, rendit të fushave dhe mënyrës së printimit. Asnjë fazë, patch, ridizajnim Odoo, ndryshim responsive ose modul i ri nuk lejohet t’i zëvendësojë me modele gjenerike.

## Rregulli absolut i identitetit vizual

Për çdo dokument:

**Formulari në ekran = Pamja me shenjën e syrit = Print Preview = Print = PDF = Excel `.xlsx`**

Të gjitha daljet duhet të përdorin të njëjtin dokument, të njëjtin rend fushash, të njëjtat rreshta, totalet, numrat e dokumenteve dhe snapshot-in historik.

## Modelet e kyçura sipas screenshot-eve

### 1. Formulari i Peshës

Formulari i Peshës duhet të ruajë modelin e screenshot-it të tabelës Excel, jo një formular administrativ të gjatë.

Struktura bazë e dokumentit:

- Data.
- Emri i bimës/artikullit si titull i dukshëm.
- Fermeri/Furnitori dhe kodi i fermerit.
- Adresa/referenca vetëm si përmbledhje; detajet e origjinës ruhen në kartelën e Fermës/Bimës.
- Kolonat e përsëritshme:
  - **Nr. Thasëve / Nr. Ambalazheve**;
  - **KG**;
  - **Peshorja / Ambalazhi**;
  - **Shuma / Pesha Neto**.
- Rreshti total në fund:
  - total ambalazhe;
  - total bruto;
  - total ambalazh;
  - total neto.
- Njësia e ambalazhit është e zgjedhshme: thasë, kuti, arka, paleta ose njësi tjetër.
- Formulari duhet të jetë i shpejtë për hedhje të shumë rreshtave nga telefoni.
- Nuk lejohet të shfaqet brenda tij formulari i gjatë GPS/certifikata/origjinë; këto ruhen te Ferma dhe Bima.

### 2. Fatura A4

Fatura e blerjes dhe e shitjes përdorin modelin A4 të screenshot-it:

- titulli **FATURË**;
- seksion i veçantë për shitësin;
- numri unik/NIPT-i dhe adresa;
- seksion me datën/orën, numrin e faturës, operatorin dhe llojin e faturës;
- seksion i veçantë për blerësin;
- tabela e artikujve me njësinë, sasinë, çmimin, zbritjen, TVSH-në dhe vlerën totale;
- përmbledhje pa TVSH, TVSH dhe total për pagesë;
- mënyra e pagesës;
- NSLF/NIVF/QR vetëm kur dokumenti është fiskal dhe këto të dhëna ekzistojnë realisht;
- dokumentet jo-fiskale nuk shfaqin kode false ose placeholder.

### 3. Fatura termike 58 mm

Formati 58 mm ruan modelin e screenshot-it termik:

- KOPJE FATURE / FATURË TATIMORE;
- kompania, pika, NIPT, data/ora, numri, operatori dhe mënyra e pagesës;
- artikujt në format kompakt `sasi × çmim = vlerë`;
- TOTAL LEK i theksuar;
- ndarja pa TVSH/TVSH;
- NSLF/NIVF vetëm kur ekzistojnë;
- optimizim real për printer termik 58 mm.

### 4. Mandat Pagese dhe Mandat Arkëtimi

Mandatet përdorin modelin klasik të screenshot-it:

- dokument A4 me **dy kopje identike në një faqe** kur zgjidhet opsioni standard;
- titulli në qendër;
- numri dhe data;
- monedha dhe shuma totale;
- `U pagua për` ose `U arkëtua nga`;
- shuma me fjalë;
- pala që jep dhe pala që merr;
- nënshkrimet:
  - Financieri;
  - Marrësi/Dhënësi;
  - Arkëtari;
- kompania dhe data e printimit në fund.

### 5. Ditari i Arkës

Ditari i Arkës ka dy prezantime të detyrueshme:

- **Forma ditore klasike**, sipas screenshot-it portokalli:
  - Nr.;
  - dokument hyrje/dalje;
  - përshkrimi;
  - hyrja;
  - dalja;
  - numri i dokumentit;
  - saldo e mëparshme;
  - gjithsej marrje;
  - gjithsej dhënie;
  - saldo e arkës;
  - kontrolloi dhe arkëtari.
- **Ditari klasik progresiv**, sipas screenshot-it:
  - lloji;
  - data;
  - numri;
  - përshkrimi;
  - arkëtuar;
  - paguar;
  - progresivi;
  - gjendja e mëparshme, totalet dhe gjendja finale.

### 6. Fletë-Hyrja, Etiketa dhe Loti RAW

Fletë-Hyrja krijohet pas Kontrollit të Cilësisë dhe Faturës së Blerjes. Në momentin e postimit krijohen:

- Fletë-Hyrja;
- lëvizja e stokut;
- loti RAW;
- etiketa termike e printueshme.

**Etiketa e lotit është dokument termik 58 mm dhe nuk lejohet të konvertohet në model A4.** Pamja me shenjën e syrit, Print Preview, Print dhe PDF përdorin të njëjtin template 58 mm.

Etiketa ka detyrimisht këtë rend dhe këto fusha:

1. kompania;
2. titulli **ETIKETË LOTI**;
3. **Kodi i Furnitorit/Fermerit** dhe **Artikulli/Bima**;
4. dy blloqe të mëdha të ndara:
   - **AMB** — numri dhe njësia e ambalazheve;
   - **PESHË NETO** — sasia neto në kg;
5. numri i lotit;
6. data;
7. përshkrimi i lexueshëm i etiketës.

Shembull i blloqeve kryesore:

```text
264   FERRË
AMB: 36 THASË
PESHË NETO: 450 KG
```

Formati i përshkrimit të etiketës:

`Kodi i Furnitorit – Artikulli/Bima – Nr. Ambalazheve – Pesha Neto`

Shembull:

`264 – Ferrë – 36 thasë – 450 kg neto`

Formati i lotit RAW:

`KodiFurnitorit-DD-MM-YYYY-AMB-NrAmbalazhe Njësia-PESH-PeshaNeto kg`

Shembull:

`264-23-07-2026-AMB-36 Thase-PESH-450 kg`

### 7. Proceset dhe lotet pasardhëse

- Çdo Proces 1, Proces 2, Proces N ka dokumentin e vet të printueshëm.
- Fushat e detyrueshme:
  - kodi i furnitorit ose `MIX` kur ka disa origjina;
  - lotet hyrëse;
  - sasia hyrëse në kg;
  - numri dhe njësia e ambalazheve;
  - sasia dalëse;
  - mbetjet/humbjet;
  - loti dalës;
  - operatori, data dhe magazina.
- Loti dalës lidhet me të gjitha lotet hyrëse dhe trashëgon dosjet e gjurmueshmërisë.

### 8. Loti final për shitje

Loti final lidhet me:

- porosinë e klientit;
- datën e porosisë;
- numrin e loteve burimore që formuan lotin final.

Modeli i numrit final:

`PorosiaKlientit-DD-MM-YYYY-Ln`

ku `n` është numri i loteve burimore.

### 9. Dosja e Gjurmueshmërisë

Dosja është një kartelë me timeline dhe lidhje aktive për çdo dokument:

1. Ferma/Origjina;
2. Bima;
3. Formulari i Peshës;
4. Kontrolli i Cilësisë;
5. Fatura e Blerjes;
6. Fletë-Hyrja;
7. Etiketa 58 mm dhe Loti RAW;
8. Procesi 1..N;
9. Magazina Produkt i Gatshëm;
10. Porosia e Klientit dhe loti final;
11. Kontrolli final i cilësisë;
12. Fatura e Shitjes;
13. Ngarkesa/Fletë-Dalja;
14. Mandati i Arkëtimit ose dokumenti bankar.

Dosja duhet të ketë:

- ikonën e syrit për hapje;
- link të drejtpërdrejtë te çdo dokument;
- **Print Dosjen**;
- **PDF Dosjen** si një PDF i bashkuar sipas rendit të timeline-it;
- **Excel Dosjen** si `.xlsx` real, me një sheet të veçantë për çdo dokument;
- indeks përmbledhës si sheet/page e parë.

## Dokumentet e kyçura

- Formulari i Peshës.
- Kontrolli i Cilësisë.
- Fletë-Hyrja / Pranimi i Blerjes.
- Fletë-Dalja / Dorëzimi i Shitjes.
- Fatura e Blerjes.
- Fatura e Shitjes.
- Mandat Arkëtimi.
- Mandat Pagese.
- Ditari i Arkës.
- Urdhri i Punës / Procesi.
- Dokumenti i Paketimit.
- Etiketa e Lotit 58 mm.
- Packing List.
- Ngarkesa / Manifesti i Kamionit.
- CMR dhe dokumentet shoqëruese të eksportit.
- Dosja e Gjurmueshmërisë.

## Rregullat teknike të pandryshueshme

1. Dokumenti i postuar ruan snapshot-in e kompanisë, partnerit, adresës, NIPT-it, artikujve, njësive, çmimeve, loteve dhe totalit.
2. Ndryshimi i kartelës master pas postimit nuk ndryshon dokumentin historik.
3. Print Preview përdor të njëjtin template renderer si PDF.
4. Excel-i është `.xlsx` real, jo CSV, dhe përmban header-in, të dhënat, rreshtat, totalet, formatimin, kufijtë, gjerësitë, print area dhe orientimin.
5. Faturat, Fletë-Hyrjet, Fletë-Daljet, mandatet, ditarët dhe dokumentet e eksportit përdorin A4, përveç faturës termike 58 mm dhe etiketës së lotit 58 mm.
6. Çdo listë dokumentesh ka kolonën Veprime me: Shiko, Edito Draft, Posto/Konfirmo, Anullo, Print, PDF dhe Excel.
7. Dokumenti i postuar nuk fshihet. Anulimi krijon kundërveprim dhe Audit Log.
8. PDF/Print/Excel përmbajnë saktësisht të dhënat e filtruara dhe snapshot-in e dokumentit.
9. Ridizajnimi i ekranit nuk lejohet të ndryshojë formatin e printimit.
10. Asnjë fazë e ardhshme nuk mund t’i zëvendësojë këto modele pa kërkesë të qartë dhe të re nga përdoruesi.
