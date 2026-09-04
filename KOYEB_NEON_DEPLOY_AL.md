# Sistemi Genit — Deploy falas me Koyeb + Neon

Ky variant përdor kodin origjinal të GitHub-it:

- `apps/api` — Node.js / Express API
- `apps/web` — frontend HTML i ndërtuar nga build scripts
- Neon — PostgreSQL falas
- Koyeb — një Web Service falas që shërben API + frontend bashkë

## 1. Krijo databazën në Neon

1. Hyr te https://neon.tech
2. Krijo projekt të ri PostgreSQL.
3. Kliko **Connect**.
4. Kopjo connection string në formën:

```txt
postgresql://USER:PASSWORD@HOST/neondb?sslmode=require&channel_binding=require
```

Ruaje si `DATABASE_URL` për Koyeb.

## 2. Krijo Web Service në Koyeb

1. Hyr te https://app.koyeb.com
2. Kliko **Create Web Service**.
3. Zgjidh **GitHub**.
4. Zgjidh repository:

```txt
genilufra-droid/sistemi-genit-cloud
```

5. Te build/deploy zgjidh Dockerfile dhe vendos:

```txt
Dockerfile path: Dockerfile.koyeb
```

6. Te instance zgjidh Free instance nëse është e disponueshme.

## 3. Environment variables në Koyeb

Vendos këto:

```txt
NODE_ENV=production
PORT=3000
DATABASE_URL=<connection string nga Neon>
JWT_SECRET=<minimum 32 karaktere, p.sh. gjenero një string të gjatë>
CORS_ORIGIN=*
```

Shembull `JWT_SECRET`:

```txt
sistemi-genit-super-secret-2026-ndryshoje-kete
```

Mos përdor shembullin në prodhim real. Vendos sekret unik.

## 4. Test pas deploy

Kur Koyeb të mbarojë deploy-in, hap:

```txt
https://URL-I-KOYEB/api/health
```

Duhet të marrësh JSON:

```json
{"status":"ok","service":"Sistemi Genit API"}
```

Pastaj hap:

```txt
https://URL-I-KOYEB
```

Krijo administratorin e parë.

## 5. Shënime të rëndësishme

- Ky është deployment i kodit origjinal, jo version PHP/InfinityFree.
- Frontend-i dhe API shërbehen nga një service i vetëm Koyeb për të respektuar limitin falas.
- Databaza është Neon PostgreSQL, jo MySQL.
- Në plan falas mund të ketë kufizime performance dhe sleep/cold start.
