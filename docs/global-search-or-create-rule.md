# Rregulli global: Kërko ose Shto

Ky rregull është detyrueshëm për çdo modul, dokument dhe fushë autocomplete/dropdown në Sistemi Genit Cloud.

## Sjellja

Kur kërkimi nuk gjen rezultat:

- shfaqet mesazhi `Nuk u gjet asnjë rezultat`;
- shfaqet butoni `+ Shto të ri`;
- butoni hap formularin përkatës pa humbur dokumentin aktual;
- teksti i kërkuar paraplotësohet si Emër/Kod kur është i vlefshëm;
- pas ruajtjes, rekordi i ri rifreskohet nga PostgreSQL;
- rekordi i ri zgjidhet automatikisht në fushën nga e cila u hap krijimi;
- përdoruesi rikthehet në dokumentin dhe rreshtin ku ishte;
- anulimi i formularit të ri rikthen formularin burim pa ndryshime.

## Entitetet minimale

- Artikull
- Klient
- Furnitor
- Fermer/Mbledhës
- Ferma/Zona
- Parcela/Zona e mbledhjes
- Magazinë
- Kategori
- Agjent/Shitës
- Automjet
- Shofer
- Itinerar
- Aset/Makineri
- Kategori shpenzimi
- Llogari Arke/Banke
- Çdo master-data tjetër që përdoret në dokumente

## Lejet dhe integriteti

- butoni shfaqet vetëm kur përdoruesi ka lejen për krijimin e entitetit;
- krijimi bëhet vetëm në API/PostgreSQL;
- kompania aktive dhe magazina aktive trashëgohen nga formulari burim;
- nuk lejohen dublikatat sipas kodit/NIPT/targës ose kufizimeve përkatëse;
- çdo krijim regjistrohet në Audit Log;
- UI nuk krijon rekord lokal provizor si burim zyrtar;
- gabimi i API-së shfaqet në formular pa humbur të dhënat e dokumentit burim.

## Testet e detyrueshme

Për çdo komponent të lidhur testohen:

1. kërkimi që gjen rezultat;
2. kërkimi pa rezultat dhe shfaqja e `+ Shto të ri`;
3. krijimi i rekordit në PostgreSQL;
4. përzgjedhja automatike e rekordit të krijuar;
5. ruajtja e gjendjes së dokumentit burim;
6. fshehja e butonit kur përdoruesi nuk ka leje;
7. bllokimi i rekordit dublikatë.
