# HomIA — Deploy a GitHub + Vercel (guía paso a paso)

> Objetivo: pasar de este entorno de desarrollo a **GitHub → Vercel** con base de datos
> gestionada, IA funcionando y subidas de archivos persistentes.
> Tiempo estimado: 1–2 h (la mayoría son copiar/pegar y esperar builds).

## 0. Arquitectura de producción

```
Navegador (mobile-first)
   │
   ▼
Vercel (Next.js 16, serverless)          ← repo de GitHub
   ├── DB:  Supabase Postgres (Prisma)   ← pooler 6543 / directo 5432
   ├── Archivos: Vercel Blob (fotos de obras, reseñas, DNI)
   ├── IA: endpoint OpenAI-compatible (OpenAI / GLM / Gemini, vía env vars)
   └── Pagos: Mercado Pago (webhook → /api/payments/webhook)
```

Cuentas necesarias (todo tiene tier gratis para arrancar):
GitHub · Vercel · Supabase · proveedor de IA (OpenAI, Z.ai GLM, Gemini u OpenRouter) · Mercado Pago (si vas a cobrar).

## 1. Subir el código a GitHub

```bash
# descomprimí homia-src.zip en una carpeta, entrá y:
cd homia
npm install                 # o pnpm/bun, lo que uses localmente
git init
git add .
git commit -m "HomIA: código base + docs de traspaso"
# creá el repo vacío en github.com (sin README) y:
git remote add origin git@github.com:TU-USUARIO/homia.git
git branch -M main
git push -u origin main
```

> El `.gitignore` ya excluye `node_modules`, `.env*`, `db/`, capturas y artefactos locales.

## 2. Adaptar el código para Vercel (5 cambios — hacelos ANTES de deployar)

Abrí la carpeta en **Google Antigravity** o **Claude Code** (lea `AGENTS.md` /
`CLAUDE.md` automáticamente). Podés pegar el prompt de `docs/historico/PROMPT-INICIO.md` y listo.
Los 5 cambios, exactos:

### 2.1 Base de datos: SQLite → Postgres (Supabase)

Creá el proyecto en supabase.com → *Connect* → copiá las dos connection strings
(Transaction pooler y Session/Direct). Editá `prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooler: :6543/postgres?pgbouncer=true&connection_limit=1
  directUrl = env("DIRECT_URL")     // directo: :5432/postgres
}
```

En `package.json` reemplazá los scripts:

```json
"postinstall": "prisma generate",
"build": "prisma generate && next build",
"db:push": "prisma db push"
```

Y en `next.config.ts` **quitá** `output: "standalone"` (es del sandbox; Vercel maneja el build solo).
El esquema usa únicamente `String / Float / Boolean / DateTime` (JSON como string):
es 100% válido en Postgres. Las carpetas `supabase/migrations/*.sql` quedan como referencia, no hace falta ejecutarlas.

Aplicá el esquema (crea las 31 tablas):

```bash
DATABASE_URL="...6543..." DIRECT_URL="...5432..." npx prisma db push
```

### 2.2 IA: reemplazar el SDK del sandbox

Ya viene incluido el shim portable **`src/lib/ai.ts`** (misma interfaz, cualquier
endpoint OpenAI-compatible). Solo hay que cambiar 4 imports:

```diff
- import ZAI from 'z-ai-web-dev-sdk'
+ import ZAI from '@/lib/ai'
```

en: `src/app/api/homy/route.ts`, `src/lib/homy-agent.ts`, `src/lib/dni-ai.ts`,
`src/app/api/catalog/route.ts` (y el route del agente si importa el SDK directo).
Después: `npm uninstall z-ai-web-dev-sdk`.

Además, en cada route que llame a la IA agregá al inicio (el análisis de DNI puede tardar):

```ts
export const maxDuration = 60
```

### 2.3 Subidas de archivos → Vercel Blob (el FS de serverless es read-only)

```bash
npm install @vercel/blob
```

Reemplazá la escritura a `public/uploads/` por `put()` y guardá la URL que devuelve,
en estos 4 endpoints: `src/app/api/uploads/route.ts`, `works`, `reviews`,
`verification/dni`. Patrón:

```ts
import { put } from '@vercel/blob'
const blob = await put(`uploads/${userId}/${nombre}`, file, { access: 'public' })
// blob.url → guardar ese URL en la base (ya todo el sistema guarda URLs, sirve igual)
```

(Bandera en Vercel → Storage → Blob, o env `BLOB_READ_WRITE_TOKEN` que Vercel crea sola.)

### 2.4 Variables de entorno (local y luego en Vercel)

Copiá `.env.example` → `.env` y completá: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`
(`openssl rand -base64 48`), `AI_BASE_URL` + `AI_API_KEY` + `AI_MODEL` + `AI_VISION_MODEL`,
y si vas a cobrar: `MP_ACCESS_TOKEN` (+ precios `MP_*`). Detalle de cada una en `.env.example`.

### 2.5 Verificación local antes de subir

```bash
npx prisma db push && npm run build && npm run dev
```

Recorré: registro/login → buscar "caño" en materiales → contratar → PDF de factura →
reseña con foto → subir DNI. Si eso pasa, el deploy pasa.

## 3. Deploy en Vercel

1. vercel.com → *Add New → Project* → importá el repo de GitHub.
2. Framework: detecta Next.js solo. Build/Install: dejar los defaults (usa el `build` del package.json).
3. *Environment Variables*: cargar TODAS las del §2.4 (Production + Preview).
4. Deploy. Primer build: ~3-5 min.

## 4. Seeds en la base de producción (una vez)

```bash
# con DATABASE_URL/DIRECT_URL de Supabase en tu .env local:
npx prisma db push
node scripts/catalogo/seed-catalog-maestro.mjs    # catálogo: 1247 elementos, 20 categorías (idempotente)
node scripts/demo/demo-seed.mjs               # opcional: datos demo (3 usuarios, stock, proyectos, reseñas)
```

Credenciales demo si corriste el seed demo: `cliente@homia.test` /
`profesional@homia.test` / `proveedor@homia.test` — pass `Homy2026!`.
⚠️ Para producción real, creá tus usuarios desde la UI y **borrá o no difundas** los demo.

## 5. Checklist post-deploy (probar de verdad, en el celu)

- [ ] Registro de los 3 roles + login/logout (cookie segura por HTTPS: automática)
- [ ] Directorio ordenado por reseñas, filtros rubro+precio, mapa con radio usable (header no tapa)
- [ ] Búsqueda difusa: "caño", "CaÑOS", "canio" → mismo resultado
- [ ] Wizard Contratar completo → escrow → factura PDF descargable → pago efectivo
- [ ] Chat estilo WhatsApp: cliente inicia, proveedor no puede iniciar
- [ ] Reseña post-proyecto y post-compra: estrellas + comentario + foto
- [ ] Marketplace: compra directa de un material → carga y muestra bien el precio
- [ ] Verificación DNI con IA → badge en perfil
- [ ] Suscripción proveedor: Básico (trial 14 días) y PRO → analítica PRO + sponsor en home
- [ ] Superagente Homy responde con datos reales (requiere IA configurada)
- [ ] Webhook MP: configurar `https://TU-DOMINIO.vercel.app/api/payments/webhook` en el panel de MP

## 6. Operación

- **Backups**: Supabase → Database → Backups (tier Pro) o `pg_dump` programado. Las fotos ya viven en Blob (replicado por Vercel).
- **Dominio propio**: Vercel → Domains (HTTPS automático).
- **Monitoreo**: Vercel → Deployments/Logs; Supabase → Reports.
- **Costos estimados para arrancar**: Vercel Hobby 0 + Supabase Free 0 + IA ~US$1-5/mes con volumen bajo + MP solo cobra por transacción. Si la app crece, el primer cuello de botella suele ser el plan de Vercel (tiempos de función) → pasar a Pro US$20/mes.

## 7. Troubleshooting rápido

| Síntoma | Causa probable |
|---|---|
| La app no arranca y pide AUTH_SECRET | Falta la env en Vercel → agregarla y redeploy |
| `P1001 can't reach database` | Connection string mal copiada / proyecto Supabase pausado |
| Timeout en verificación de DNI | Falta `export const maxDuration = 60` en el route, o el proveedor de IA está lento |
| Las fotos "desaparecen" al redeploy | No se migraron los uploads a Blob (§2.3) |
| La IA responde el fallback siempre | `AI_API_KEY` vacía o modelo inexistente en ese endpoint → mirar logs de la función |
| Build falla con Turbopack/webpack | Asegurarse de que `build` sea `prisma generate && next build` (§2.1) |
