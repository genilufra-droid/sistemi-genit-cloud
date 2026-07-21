# Si ta ngarkosh në GitHub

Repository aktual: `genilufra-droid/sistemi-genit-cloud`

## Mënyra e rekomanduar — nga PC me GitHub Desktop

1. Shkarko ZIP-in dhe bëj Extract.
2. Hape GitHub Desktop.
3. `File > Clone repository` dhe klono `sistemi-genit-cloud`.
4. Kopjo të gjitha përmbajtjet e dosjes së ekstraktuar brenda repository-t të klonuar. Mos kopjo vetë dosjen e jashtme si një nivel shtesë.
5. Te GitHub Desktop shkruaj commit: `Add Sistemi Genit Cloud Phase 1`.
6. Shtyp `Commit to main`, pastaj `Push origin`.

Në root të GitHub duhet të shfaqen direkt:

```text
apps
legacy
docs
.github
README.md
package.json
docker-compose.yml
```

Nuk duhet të shfaqet një dosje e vetme `Sistemi_Genit_Cloud_Phase1` që i mban të gjitha brenda.

## Pas upload-it

Te Railway:

- `genit-api > Settings > Add Root Directory` → `/apps/api`
- `genit-web > Settings > Add Root Directory` → `/apps/web`

Pastaj vendos Variables sipas README-së.
