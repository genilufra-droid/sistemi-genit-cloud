# Sistemi Genit — Deploy origjinal Node.js/PostgreSQL në Render

Ky është varianti **Rruga 1**: përdoret sistemi origjinal i GitHub-it, jo portimi PHP/MySQL për InfinityFree.

## Çfarë krijon `render.yaml`

- `sistemi-genit-api` — Node.js API (`apps/api`)
- `sistemi-genit-web` — Web frontend (`apps/web`)
- `sistemi-genit-db` — PostgreSQL database

## Hapat në Render

1. Hyr në Render.
2. New → Blueprint.
3. Lidho GitHub repository:
   `genilufra-droid/sistemi-genit-cloud`
4. Render lexon automatikisht `render.yaml` nga root i repository-t.
5. Kliko Apply / Create Blueprint.
6. Prit të kryhen deploy-et:
   - `sistemi-genit-db`
   - `sistemi-genit-api`
   - `sistemi-genit-web`

## Testet

API:

```text
https://URL-I-API/api/health
```

Duhet të kthejë JSON me `status: ok`.

Web:

```text
https://URL-I-WEB
```

Në hapjen e parë krijo administratorin e parë.

## Shënim për CORS

Fillimisht `CORS_ORIGIN=*` që deploy të mos bllokohet. Pasi sistemi të hapet, mund ta mbyllësh CORS-in duke vendosur te `sistemi-genit-api`:

```env
CORS_ORIGIN=https://URL-I-WEB
```

Pastaj bëj redeploy të API-së.

## Mos përdor InfinityFree për këtë variant

Ky variant kërkon Node.js + PostgreSQL. InfinityFree është PHP/MySQL dhe nuk e ekzekuton këtë sistem origjinal.
