# Migrimi nga HTML 6.4

HTML-i origjinal ruhet te:

`legacy/Sistemi_Genit_Full_Single_6_4_Cash_Formats_MultiCompany.html`

Ai nuk përdoret si databazë në Cloud. IndexedDB është lokal për çdo browser.

## Rendi i sigurt

1. Hap HTML 6.4 në pajisjen ku ndodhen të dhënat.
2. Përdor funksionin Backup/Export JSON të sistemit.
3. Ruaj një kopje të pandryshuar.
4. Mos e importo drejtpërdrejt në production.
5. Në Fazën 2 krijohet importuesi staging dhe raporti i diferencave.
6. Rakordohen partnerët, artikujt, faturat, stoku, lotet, Arka dhe Banka.

Ky repository nuk pretendon se ka migruar automatikisht të dhënat ekzistuese të IndexedDB-së.
