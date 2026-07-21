# GitHub CI / Railway registry fix

Ky version heq adresat e regjistrit të brendshëm nga `package-lock.json` dhe përdor regjistrin publik:

```text
https://registry.npmjs.org/
```

Skedarët e ndryshuar:

- `package-lock.json`
- `apps/api/package-lock.json`
- `apps/web/package-lock.json`
- `.github/workflows/ci.yml`
- `.npmrc`
- `apps/api/.npmrc`
- `apps/web/.npmrc`

Pas kopjimit në repository bëj commit dhe `Push origin`.
