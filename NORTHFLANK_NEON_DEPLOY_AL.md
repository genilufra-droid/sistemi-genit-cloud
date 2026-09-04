# Sistemi Genit — Deploy falas me Northflank + Neon

Ky variant përdor source-in origjinal të GitHub-it:

- `apps/api` — Node.js / Express / PostgreSQL
- `apps/web` — frontend web
- `Dockerfile.northflank` — build full-stack në një service të vetëm
- Neon — PostgreSQL falas

## 1. Krijo databazën në Neon

1. Hyr në https://neon.tech
2. Krijo një project PostgreSQL.
3. Kliko **Connect**.
4. Kopjo connection string.

Shembull:

```text
postgresql://user:password@host.neon.tech/neondb?sslmode=require&channel_binding=require
```

## 2. Krijo service në Northflank

1. Hyr në https://app.northflank.com
2. Krijo Project të ri, p.sh. `sistemi-genit`.
3. Kliko **Create New → Service**.
4. Zgjidh **Deploy from Git repository**.
5. Lidhe GitHub repository:

```text
genilufra-droid/sistemi-genit-cloud
```

6. Te build zgjidh **Dockerfile**.
7. Vendos Dockerfile path:

```text
Dockerfile.northflank
```

8. Porta publike:

```text
3000
```

## 3. Environment variables

Vendos këto variabla:

```text
NODE_ENV=production
PORT=3000
DATABASE_URL=connection_string_i_Neon
JWT_SECRET=sistemi-genit-super-secret-2026-ndryshoje-kete-me-tekst-te-gjate
CORS_ORIGIN=*
```

`JWT_SECRET` duhet të jetë minimum 32 karaktere.

## 4. Deploy dhe test

Pas deploy-it, hap URL-në publike të Northflank:

```text
https://URL-I-NORTHFLANK/api/health
```

Duhet të kthejë JSON:

```json
{"status":"ok"}
```

Pastaj hap:

```text
https://URL-I-NORTHFLANK
```

Krijo administratorin e parë të sistemit.

## Shënim

Mos përdor InfinityFree për këtë variant. Source-i origjinal kërkon Node.js dhe PostgreSQL, jo PHP/MySQL.
