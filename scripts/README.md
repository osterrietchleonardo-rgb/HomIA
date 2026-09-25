# scripts/

Todos se corren **desde la raíz del proyecto** (leen `.env` y usan rutas relativas a la raíz).
Ojo: la base local es la de producción (Supabase); cualquier script que escribe, escribe en prod.

| Carpeta | Qué hay | Comando típico |
|---|---|---|
| `catalogo/` | Catálogo maestro (1764 elementos, 20 categorías; `--dry-run` simula, `--categorias-nuevas` crea electrodomesticos y plagas) y su seeder idempotente | `node scripts/catalogo/seed-catalog-maestro.mjs` |
| `demo/` | Datos demo (3 usuarios, stock, proyectos, reseñas) + `assets/` (DNI y fotos de reseñas) | `node scripts/demo/demo-seed.mjs` |
| `base/` | Utilidades de la base (activar RLS en Supabase) | `node scripts/base/enable-rls.mjs` |
| `e2e/` | Pruebas vivas: auditoría de seguridad (29 checks) | `bash scripts/e2e/sec-audit.sh` |
| `limpieza/` | Purgas de usuarios y datos de prueba de tareas anteriores | revisar el script antes de correrlo |
| `medios/` | Generadores de retratos, fotos de reseñas, videos y favicon | — |
| `historico/` | Scripts de un solo uso ya aplicados y E2E del sandbox viejo (`/home/z/...`, puerto 3100). Solo consulta: no se corren tal cual | — |
