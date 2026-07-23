# Faza 4.2 — Kriteret e pranimit

## Procesi
- Drafti merr numër automatik `UP-YYYY-NNNNNN`.
- Vetëm lotet AVAILABLE të së njëjtës kompani dhe magazinë pranohen si hyrje.
- Bilanci detyrues: hyrje = dalje + mbetje + humbje.
- Postimi konsumon lotet hyrëse dhe stokun përkatës.
- Postimi krijon një lot PROCESSED automatik dhe hyrje stoku për produktin dalës.
- Kostoja e lotit dalës përfshin koston e hyrjeve dhe koston direkte.
- Postimi i dyfishtë bllokohet.

## Paketimi
- Drafti merr numër automatik `PAK-YYYY-NNNNNN`.
- Bilanci detyrues: hyrje = dalje + mbetje.
- Dalja duhet të përputhet me numrin e pakove × njësitë për pako × peshën neto për njësi.
- Postimi konsumon lotin PROCESSED dhe stokun e tij.
- Postimi krijon lot PACKAGED automatik dhe hyrje stoku për artikullin e paketuar.
- Pako, kuti/paleta dhe data e skadencës ruhen për gjurmueshmëri.
- Postimi i dyfishtë bllokohet.

## Gjurmueshmëria
- Nga loti PACKAGED shfaqet zinxhiri RAW → PROCESSED → PACKAGED.
- Nga loti RAW shfaqen të gjithë pasardhësit.
- Çdo lëvizje ka dokumentin burim, numrin, përdoruesin dhe gjendjen pas lëvizjes.

## Dokumentet
- Urdhri i Punës dhe Dokumenti i Paketimit kanë Preview, Print, PDF dhe Excel `.xlsx` me të njëjtin model.
- Dokumenti i postuar ruan snapshot-in e vet.
