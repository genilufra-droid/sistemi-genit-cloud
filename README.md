# Sistemi Genit Cloud — Faza 1

Ky repository është themeli online dhe multi-user i Sistemi Genit. Është përgatitur nga versioni HTML 6.4, i cili ruhet te `legacy/` si referencë funksionale dhe vizuale.

## Çfarë punon në këtë fazë

- PostgreSQL qendror
- Konfigurimi i parë pa të dhëna demo
- Login me username/email dhe fjalëkalim të hash-uar
- Multi-company
- Multi-magazinë
- Përdorues, role dhe akses sipas kompanisë/magazinës
- Audit Log
- Përditësime live me Socket.IO
- Dashboard Cloud Core
- API health check

## Çfarë nuk deklarohet ende si e migruar

Modulet e peshimit, blerjeve, shitjeve, stokut, gjurmueshmërisë, Arkës, Bankës, PDF/XLSX dhe raportet e formatizuara janë në HTML-in 6.4, por duhet të kalohen një nga një në backend me transaksione PostgreSQL. Menutë e tyre në frontend shfaqen të çaktivizuara dhe të etiketuara për fazat pasuese, që të mos krijohet përshtypja se janë online kur ende nuk janë.

## Struktura

```text
apps/api   Node.js + Express + PostgreSQL + JWT + Socket.IO
apps/web   React + Vite
legacy     HTML 6.4 origjinal
```

## Vendosja në Railway

### 1. `genit-api`

- Source Repo: ky repository
- Branch: `main`
- Root Directory: `/apps/api`
- Variables:

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=VENDOS_NJE_SEKRET_TE_GJATE_MINIMUMI_32_KARAKTERE
CORS_ORIGIN=*
```

Pas deploy-it, te `Settings > Networking` shtyp `Generate Domain`.

Kontrolli:

```text
https://DOMAIN-I-API/api/health
```

Duhet të kthejë `status: ok`.

### 2. `genit-web`

- Source Repo: i njëjti repository
- Branch: `main`
- Root Directory: `/apps/web`
- Variables:

```env
VITE_API_URL=https://DOMAIN-I-API
```

Pas deploy-it gjenero domain-in e web-it.

### 3. Mbyll CORS-in

Pasi të marrësh domain-in e `genit-web`, ndrysho te `genit-api`:

```env
CORS_ORIGIN=https://DOMAIN-I-WEB
```

Bëj redeploy të API-së.

## Hyrja e parë

Në hapjen e parë web-i shfaq `Konfigurimi i parë` dhe kërkon:

- Organizatën
- Kompaninë e parë
- NIPT-in
- Magazinën e parë
- Super Administratorin
- Username dhe password

Pas ruajtjes, konfigurimi bllokohet dhe sistemi kalon në login normal.

## Zhvillimi lokal

1. Ngrije PostgreSQL:

```bash
docker compose up -d
```

2. API:

```bash
cd apps/api
cp .env.example .env
npm install
npm run dev
```

3. Web:

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

- API: `http://localhost:3000/api/health`
- Web: `http://localhost:5173`

## Siguria

- `.env` nuk ngarkohet në GitHub.
- Password-et ruhen me bcrypt.
- JWT kërkon secret minimumi 32 karaktere.
- API filtron çdo rekord me `tenant_id` dhe akseset e përdoruesit.
- Përdoruesi nuk mund të çaktivizojë vetveten.
- Nuk ka username/password demo.
