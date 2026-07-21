# Hapat menjëherë pas upload-it

## genit-api

1. `Settings > Source > Add Root Directory`
2. Shkruaj `/apps/api`
3. Te `Variables` shto:

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=një-vlerë-e-gjatë-rastësore-minimumi-32-karaktere
CORS_ORIGIN=*
```

4. Shtyp Deploy/Redeploy.
5. Kur të jetë Online, `Settings > Networking > Generate Domain`.
6. Hape `https://DOMAIN/api/health`.

## genit-web

1. `Settings > Source > Add Root Directory`
2. Shkruaj `/apps/web`
3. Te `Variables` shto:

```env
VITE_API_URL=https://DOMAIN-I-GENIT-API
```

4. Shtyp Deploy/Redeploy.
5. Gjenero domain-in e web-it.

## Siguro CORS

Pasi web-i të ketë domain, te `genit-api` zëvendëso:

```env
CORS_ORIGIN=*
```

me:

```env
CORS_ORIGIN=https://DOMAIN-I-GENIT-WEB
```

Pastaj bëj Redeploy të API-së.
