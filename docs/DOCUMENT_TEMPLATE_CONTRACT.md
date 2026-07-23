# Kontrata e formateve të dokumenteve

Kjo kontratë është detyruese për Sistemi Genit. Modelet e dërguara nga përdoruesi janë referenca e pamjes dhe strukturës së dokumenteve.

## Rregulli i identitetit vizual

Për çdo dokument:

**Form View / Preview = Print = PDF = Excel `.xlsx`**

Të katër daljet duhet të përdorin të njëjtin model, të njëjtin rend fushash, të njëjtat rreshta, totalet dhe dokumentin e njëjtë të postuar.

## Dokumentet e kyçura

- Formulari i Peshës.
- Fletë-Hyrja / Pranimi i Blerjes.
- Fletë-Dalja / Dorëzimi i Shitjes.
- Fatura e Blerjes.
- Fatura e Shitjes.
- Mandat Arkëtimi.
- Mandat Pagese.
- Urdhri i Punës.
- Dokumenti i Paketimit.
- Packing List.
- Ngarkesa / Manifesti i Kamionit.
- CMR dhe dokumentet shoqëruese të eksportit.

## Rregullat teknike

1. Dokumenti i postuar ruan snapshot-in e kompanisë, partnerit, adresës, NIPT-it, artikujve, njësive, çmimeve, loteve dhe totalit.
2. Ndryshimi i kartelës master pas postimit nuk ndryshon dokumentin historik.
3. Print Preview përdor të njëjtin template renderer si PDF.
4. Excel-i është `.xlsx` real, jo CSV, dhe përmban:
   - header-in e dokumentit;
   - të dhënat e kompanisë dhe partnerit;
   - rreshtat realë;
   - formulat/totale të ruajtura;
   - formatim, kufij, gjerësi kolonash;
   - print area, orientim dhe madhësi faqeje.
5. Faturat, fletë-hyrjet, fletë-daljet, mandatet dhe dokumentet e eksportit përdorin A4.
6. Formati 58 mm përdoret vetëm për dokumentet e përcaktuara si termike.
7. Çdo listë dokumentesh ka kolonën Veprime:
   - Shiko;
   - Edito Draft;
   - Posto/Konfirmo;
   - Anullo;
   - Print;
   - PDF;
   - Excel.
8. Dokumenti i postuar nuk fshihet. Anulimi krijon kundërveprim dhe Audit Log.
9. PDF/Print/Excel duhet të përmbajnë të njëjtat të dhëna të filtruara që shfaqen në ekran.

## Formati i lotit automatik

Loti nuk ka template manual krijimi. Ai shfaqet si rezultat i dokumentit burim:

- Peshim/Pranim → Lot RAW.
- Urdhër Pune → Lot PROCESSED.
- Paketim → Lot PACKAGED.
- Kthim i pranuar → Lot RETURN ose lidhje me lotin origjinal.

Kartela 360° e lotit ka Preview/Print/PDF/Excel, por krijimi i tij kryhet vetëm nga postimi i dokumentit burim.
