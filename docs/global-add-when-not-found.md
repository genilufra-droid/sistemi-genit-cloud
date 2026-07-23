# Rregull global — “+ Shto të ri” kur kërkimi nuk gjen rezultat

Ky rregull është detyrues për të gjitha modulet dhe formularët e Sistemi Genit Cloud.

## Sjellja
Kur një fushë kërkimi/autocomplete nuk gjen rezultat, dropdown-i duhet të shfaqë menjëherë:

`+ Shto “<teksti i kërkuar>”`

Veprimi hap formularin e krijimit në modal, pa mbyllur dokumentin aktual. Pas ruajtjes:
- rekordi i ri shkruhet në PostgreSQL;
- lista rifreskohet;
- rekordi i ri zgjidhet automatikisht në fushën prej nga u hap;
- përdoruesi vazhdon dokumentin pa humbur të dhënat e plotësuara.

## Zbatimi minimal
Sjellja duhet të zbatohet te komponenti i përbashkët i kërkimit dhe të funksionojë për:
- Artikull;
- Klient;
- Furnitor/Fermer;
- Ferma/Zona;
- Parcela/Zona e mbledhjes;
- Magazinë;
- Mjet/Automjet;
- Shofer;
- Aset/Makineri;
- Kategori shpenzimi;
- Llogari arke/banke;
- çdo master-data tjetër të përdorur në dokumente.

## Lejet dhe siguria
- Butoni shfaqet vetëm kur përdoruesi ka leje për krijimin e atij entiteti.
- Krijimi respekton kompaninë aktive dhe izolimin multi-company.
- Nuk lejohet rekord bosh ose dublikatë.
- Gabimi i serverit shfaqet pa humbur formularin aktual.

## Kriteret e pranimit
1. Kërkimi pa rezultat shfaq “+ Shto të ri”.
2. Modal-i hapet mbi dokumentin aktual.
3. Pas ruajtjes, rekordi i ri zgjidhet automatikisht.
4. Të dhënat e dokumentit aktual nuk humbin.
5. Funksionon në desktop dhe Android.
6. Testohet në Chromium për të paktën Artikull, Furnitor dhe Aset.
