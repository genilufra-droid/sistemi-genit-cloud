# Faza 4 — Gjurmueshmëri e plotë dhe module operative ERP

## 1. Parimi bazë

Gjurmueshmëria nuk është vetëm regjistri i lotit. Ajo është lidhja e pandërprerë mes:

**Fermer/mbledhës → Fermë ose zonë mbledhjeje → Parcelë → Pranim/Peshim → Lot automatik → Kontroll cilësie → Proces/Urdhër pune → Lot produkti të përpunuar → Paketim → Paletë → Ngarkesë eksporti → Kamion/Kontejner → Fletë-dalje/Faturë shitje → Klient → Mandat arkëtimi ose pagesë bankare → Derdhje në bankë/Rakordim.**

Çdo dokument duhet të ketë lidhjen `source_document`, `source_line`, `company_id`, `warehouse_id`, `created_by`, `posted_by`, `created_at`, `posted_at`, `status` dhe Audit Log.

## 2. Fermeri, ferma dhe parcela

- **Fermeri/mbledhësi** është personi ose subjekti i origjinës.
- **Furnitori** është pala tregtare që lëshon faturën; mund të jetë i njëjti person me fermerin ose grumbullues tjetër.
- **Ferma/Zona e mbledhjes** është njësia gjeografike e origjinës.
- **Parcela** është vendi konkret brenda fermës. Për bimë të egra përdoret emërtimi “Zona e mbledhjes”.
- Këto janë të dhëna master dhe nuk krijohen për çdo blerje.

## 3. Loti nuk krijohet manualisht

Butoni i zakonshëm `+ Lot i Ri` hiqet nga përdorimi normal.

Loti krijohet automatikisht vetëm kur postohet një dokument fizik:

1. **Pranim/Peshim blerjeje** krijon lot të lëndës së parë.
2. **Urdhër pune i postuar** konsumon një ose disa lote hyrëse dhe krijon lotin e produktit dalës.
3. **Paketim i postuar** konsumon lot të përpunuar dhe krijon lot paketimi/paletizimi.
4. **Kthim klienti i pranuar** krijon lot kthimi ose e lidh sasinë me lotin origjinal pas kontrollit të cilësisë.
5. **Inventar korrigjues** nuk ndryshon lotin drejtpërdrejt; krijon dokument korrigjimi dhe lëvizje audituese.

Numërimi është automatik dhe unik për kompani, p.sh.:

- `RAW-GJF-20260722-0001` — lot lënde e parë.
- `PRC-GJF-20260723-0001` — lot i përpunuar.
- `PKG-GJF-20260724-0001` — lot paketimi.
- `PAL-GJF-20260724-0001` — paletë/SSCC.

Loti nuk fshihet pasi dokumenti burim është postuar. Ai mund të bllokohet, të futet në karantinë, të konsumohet, të tërhiqet ose të korrigjohet me dokument kundërveprues.

## 4. Rrjedha e pranimit

**Porosi blerjeje → Peshim → Kontroll paraprak → Fletë-hyrje/Pranim → Lot automatik.**

Fushat e detyrueshme për lotin e parë:

- artikulli;
- fermeri/mbledhësi;
- furnitori tregtar;
- ferma/zona;
- parcela;
- data e korrjes/mbledhjes;
- data e pranimit;
- magazina;
- pesha bruto, ambalazhi, neto dhe neto pas zbritjes;
- dokumenti i peshës dhe dokumenti i pranimit;
- statusi i cilësisë.

Në postim, sistemi krijon në një transaksion PostgreSQL:

- lotin;
- stokun sipas magazinës;
- lëvizjen e lotit `RECEIPT_IN`;
- lëvizjen e magazinës;
- kartelën e artikullit;
- lidhjen me blerjen/furnitorin;
- Audit Log.

## 5. Cilësia

Statusi i lotit pas pranimit:

- `QUARANTINE` — nuk shitet dhe nuk përpunohet pa aprovimin e cilësisë;
- `APPROVED` — i disponueshëm;
- `REJECTED` — i bllokuar;
- `PARTIAL_APPROVAL` — ndahet me dokument split në lot të aprovuar dhe lot të refuzuar.

Rezultatet laboratorike, lagështia, papastërtia, pesticidet, fotografitë dhe dokumentet lidhen me lotin.

## 6. Procesi dhe Urdhri i Punës

Urdhri i punës ka:

- artikullin dalës;
- procesin: pastrim, tharje, prerje, sitje, përzierje, etj.;
- magazinën/lokacionin;
- makinerinë/asetin;
- operatorin dhe turnin;
- lote hyrëse dhe sasi reale;
- sasinë dalëse;
- mbetjet, humbjet dhe nënproduktet;
- energjinë, punën dhe shpenzimet direkte;
- kontrollet e cilësisë.

Kur postohet:

- konsumohen lotet hyrëse me lëvizje `PROCESS_OUT`;
- krijohet automatikisht loti dalës `PROCESS_IN`;
- ruhet genealogjia shumë-me-shumë `input_lot → work_order → output_lot`;
- llogaritet rendimenti dhe kostoja reale për kg.

## 7. Paketimi

Paketimi nuk është thjesht ndryshim njësie. Është dokument prodhimi/paketimi:

- konsumon lot të përpunuar;
- konsumon materiale ambalazhi;
- krijon lot paketimi;
- krijon kuti, paleta dhe etiketa;
- çdo kuti/paletë ka barcode/QR ose SSCC;
- ruhet sasia, pesha neto/bruto, numri i pakove dhe skadenca.

Një paletë mund të përmbajë vetëm një lot ose shumë lote sipas rregullit të kompanisë. Nëse përmban shumë lote, sistemi ruan përbërjen e saktë të paletës.

## 8. Ngarkesa dhe eksporti

Moduli **Ngarkesat/Eksporti** lidh shitjen me logjistikën fizike.

Statuset:

`DRAFT → PLANNED → LOADING → SEALED → DISPATCHED → AT_BORDER → DELIVERED → CLOSED`.

Ngarkesa përmban:

- klientin dhe porositë/faturat;
- magazinën e nisjes;
- kamionin, rimorkion ose kontejnerin;
- shoferin dhe kontaktet;
- targat, nr. kontejnerit dhe nr. vulës;
- itinerarin, pikat kufitare, destinacionin dhe Incoterm;
- datën/orën e ngarkimit dhe nisjes;
- peshën bruto/neto dhe numrin e paletave/kutive;
- lotet, paketimet dhe paletat e ngarkuara;
- CMR, Packing List, Commercial Invoice, Fletë-dalje dhe dokumentet doganore;
- temperaturën/kushtet kur kërkohet;
- statuset dhe provën e dorëzimit.

Postimi i nisjes krijon `SHIPMENT_OUT`, ul stokun dhe rezervimin, dhe lidh çdo lot me klientin për gjurmim përpara dhe recall.

## 9. Shitja dhe rruga e parasë

Rruga financiare është pjesë e të njëjtit zinxhir:

### Pagesë cash

`Ngarkesë/Fletë-dalje → Faturë shitje → Detyrim klienti → Mandat arkëtimi → Ditari i arkës → Derdhje në bankë → Ditari i bankës → Rakordim.`

### Pagesë direkte bankare

`Faturë shitje → Detyrim klienti → Postë banke → Rakordim me faturën.`

Derdhja në bankë nuk krijon pagesë të dytë të klientit. Ajo transferon shumën nga arka në bankë dhe ruan lidhjen me mandatet e arkëtimit që përfshihen në derdhje.

## 10. Raporti “Gjurmueshmëri 360°”

Nga një lot duhet të shihet:

- fermeri, furnitori, ferma dhe parcela;
- peshimi dhe fletë-hyrja;
- analizat e cilësisë;
- çdo proces dhe makineri;
- lotet dalëse;
- paketimet, kutitë dhe paletat;
- ngarkesat, kamioni, shoferi, CMR dhe dogana;
- klientët dhe faturat ku është shitur;
- mandatet e arkëtimit/pagesat bankare;
- derdhjet në bankë;
- shpenzimet dhe kostoja reale;
- Audit Log.

Gjurmimi duhet të punojë në të dy drejtimet:

- **Backward trace:** nga klienti/ngarkesa te parcela dhe fermeri.
- **Forward trace:** nga parcela/loti te çdo klient dhe ngarkesë.

## 11. Moduli Shpenzime

Regjistron çdo shpenzim me kategori, qendër kostoje, dokument, TVSH, mënyrë pagese dhe lidhje opsionale me:

- lot;
- urdhër pune;
- ngarkesë;
- udhëtim;
- automjet;
- aset;
- furnitor;
- departament/projekt.

Dokumentet: kërkesë shpenzimi, aprovim, faturë shpenzimi, pagesë, rimbursim punonjësi dhe shpenzim periodik.

## 12. Moduli Logjistikë

Përfshin automjete, rimorkio, shoferë, karta karburanti, kilometrazh, udhëtime, itinerare, ndërrime, servise, goma, siguracione, taksa, leje dhe incidente.

Raportet e detyrueshme:

1. Konsum karburanti për automjet.
2. Konsum real kundrejt normës.
3. Kosto për kilometër.
4. Kosto për udhëtim.
5. Kosto për ngarkesë.
6. Kilometra bosh kundrejt kilometrave me ngarkesë.
7. Kilometra sipas shoferit.
8. Udhëtime dhe itinerare sipas periudhës.
9. Mirëmbajtje dhe riparime sipas automjetit.
10. Afatet e servisit të ardhshëm.
11. Goma: blerje, montim, kilometrazh dhe kosto.
12. Siguracione, taksa, kolaudim dhe dokumente në skadencë.
13. Disponueshmëri dhe ditë jashtë pune.
14. Incidente, dëme dhe penalitete.
15. Rentabilitet për automjet, itinerar dhe ngarkesë.

## 13. Moduli Ngarkesa/Eksport

Raportet kryesore:

- ngarkesa sipas statusit;
- ngarkesa sipas klientit/shtetit;
- tonelata dhe paleta sipas periudhës;
- lotet sipas ngarkesës;
- ngarkesat sipas kamionit/shoferit;
- koha e ngarkimit dhe vonesat;
- kapaciteti i përdorur i mjetit;
- pesha e deklaruar kundrejt peshës reale;
- CMR/dokumente që mungojnë;
- ngarkesa në kufi ose të vonuara;
- kosto dhe fitim për ngarkesë;
- eksport sipas Incoterm, destinacionit dhe monedhës;
- prova e dorëzimit;
- recall sipas ngarkesës;
- përmbledhje mujore eksporti.

## 14. Moduli Asete

Regjistron çdo makineri, pajisje, mjet pune, ndërtesë, instalim dhe investim.

Për çdo aset:

- kod, kategori, vendndodhje, përgjegjës;
- furnitor, faturë blerjeje dhe vlerë fillestare;
- datë aktivizimi;
- metodë amortizimi, jetëgjatësi dhe vlerë mbetur;
- komponentë dhe numra serialë;
- mirëmbajtje, defekte dhe downtime;
- kalibrime dhe dokumente;
- lidhje me urdhra pune dhe kosto reale;
- transferime, rivlerësime, shitje ose nxjerrje jashtë përdorimit.

Raportet: regjistri i aseteve, amortizimi mujor/vjetor, vlera kontabël neto, investimet sipas periudhës, mirëmbajtja sipas asetit, downtime, kosto totale e pronësisë, asetet sipas vendndodhjes, dokumentet në skadencë, asetet pa përdorim dhe fitim/kosto sipas makinerisë.

## 15. Integriteti i detyrueshëm

- PostgreSQL është burimi i vetëm zyrtar.
- Numrat e lotit, ngarkesës, mandatit dhe dokumenteve janë unikë për kompani.
- Postimet përdorin transaksione SQL dhe bllokim konkurrence.
- Nuk lejohet stok negativ ose konsum më i madh se gjendja e lotit.
- Dokumentet e postuara nuk fshihen; anulohen me kundërveprim.
- Çdo ndryshim ka Audit Log dhe përdoruesin përgjegjës.
- Raportet llogariten nga dokumentet e postuara dhe lëvizjet server-side.

## 16. Rendi i implementimit

1. Heqja e krijimit manual të lotit dhe krijimi automatik nga Pranimi/Peshimi.
2. Cilësia, karantina, split dhe bllokimi.
3. Urdhri i Punës me genealogji dhe lot dalës automatik.
4. Paketimi, kutitë, paletat dhe etiketat.
5. Ngarkesat/Eksporti dhe dokumentet e nisjes.
6. Lidhja me shitjen, mandatet, bankën dhe rakordimin.
7. Shpenzimet dhe qendrat e kostos.
8. Logjistika dhe 15 raportet.
9. Asetet, amortizimi dhe mirëmbajtja.
10. Raporti 360°, recall dhe testet multi-user.