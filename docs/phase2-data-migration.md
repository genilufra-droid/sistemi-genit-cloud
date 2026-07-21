# Migrimi i të dhënave legacy

API e Fazës 2 ekspozon `POST /api/migration/legacy` për import të:

- kategorive
- artikujve
- furnitorëve
- klientëve

Payload-i kërkon `companyId` dhe objektin `data`. Importi përdor `UPSERT`, ruan izolimin sipas tenant/kompani dhe regjistrohet në Audit Log.
