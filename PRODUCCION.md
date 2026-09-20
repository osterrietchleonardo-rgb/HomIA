# HomIA — Guía de puesta en producción

> Checklist y variables para pasar de desarrollo a producción sin sorpresas.
> Verificado: build de producción standalone 100% verde (smoke API 18/18 + E2E visual 14/14).

## 1. Variables de entorno (`.env`)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | ✅ | Ruta de la base SQLite. **Usá ruta absoluta** en el servidor: `file:/ruta/absoluta/db/custom.db` (si es relativa, el servidor standalone la busca en otra carpeta). |
| `AUTH_SECRET` | ✅ en producción | Clave que firma las cookies de sesión. **La app NO arranca en producción sin esta variable** (falla a propósito con un error claro). Generá una con `openssl rand -base64 48`. |
| `MP_ACCESS_TOKEN` | Para cobros | Token de Mercado Pago (mercadopago.com → Tus aplicaciones → Credenciales de producción). Sin él, la app funciona igual pero los cobros (facturas, escrow, plan PRO) devuelven un mensaje honesto de "no configurado". |
| `MP_PRO_PRICE_ARS` | opcional | Precio mensual del plan PRO en ARS (default 4999). |

## 2. Compilar y arrancar

```bash
npm install          # instala dependencias (incluye pdf-lib)
npm run build        # compila con webpack y arma .next/standalone (re-copia static/ y public/ limpio)
npm start            # arranca el servidor standalone en el puerto 3000
```

> ⚠️ **Importante (lecciones del deploy):**
> - El build de producción se hace con `next build --webpack` (fijado en package.json).
>   El build con Turbopack no emite `main-app-*.js` y la app NO hidrata en producción
>   (se ve el HTML del servidor pero nada responde: 0 hidratación).
> - El script de build borra y re-copia `static/` y `public/` dentro del standalone:
>   no lo hagas a mano con `cp -r` sobre un standalone existente (crea `static/static/`
>   anidado y el server termina respondiendo HTML del catch-all por cada chunk JS).
> - Antes de redeployar, matá SIEMPRE el proceso viejo del puerto (`fuser -k 3000/tcp`
>   o `kill -9 <pid>` de `ss -tlnp`). Un `next-server` viejo que siga escuchando el
>   puerto sirve código stale y es indetectable con `pgrep` en algunos sandboxes.

`npm start` ejecuta `NODE_ENV=production bun .next/standalone/server.js`. También vale:

```bash
PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js
```

Detrás de Nginx/Caddy con HTTPS no hace falta nada especial: las cookies de sesión
pasan a `Secure` automáticamente cuando el request llega con `X-Forwarded-Proto: https`.

## 3. Datos que hay que persistir

| Ruta | Qué es | Nota |
|---|---|---|
| `db/custom.db` | Toda la base (usuarios, proyectos, mensajes, reseñas) | Backupeala (es un solo archivo). |
| `public/uploads/` | Fotos de obras, DNI, fotos de reseñas (subidas en runtime) | Si redeployás borrando la carpeta, se pierden las subidas: montala como volumen o incluíla en el backup. |

## 4. Mercado Pago

- El webhook llega a `https://TU-DOMINIO/api/payments/webhook` — configurá esa URL en el panel de MP (o dejá que MP la descubra: el preference/preapproval ya la declara con el dominio del request).
- Probá con credenciales de TEST antes de pasar a producción.
- Las suscripciones (Plan Básico US$50/mes con 14 días de prueba + Plan PRO US$100/mes) son **solo para proveedores**. El webhook mantiene compatibilidad con referencias legacy de profesionales, pero el alta nueva es de proveedor.

## 5. Seguridad (auditoría integral pre-producción)

Implementado y verificado con pruebas en vivo (`bash scripts/sec-audit.sh` — 29/29):

- **Sesiones**: bcrypt + JWT httpOnly con `SameSite=Lax`; cookie `Secure` automática si el request llega por HTTPS. Fail-fast si falta `AUTH_SECRET` en producción.
- **Rate limiting** (`src/lib/rate-limit.ts`): solo cuenta intentos FALLIDOS — 10 fallos por email+IP y 30 por IP cada 15 min en login (respuesta 429); registro limitado a 8 cuentas por IP por hora.
- **IDOR**: todas las lecturas de recursos por id (facturas JSON y PDF, cobros, proyectos, compras, conversaciones) verifican que el usuario sea parte del recurso → 403.
- **Uploads**: carpeta sanitizada contra path traversal (solo `[a-zA-Z0-9_-]`), MIME whitelist (JPG/PNG/WEBP/PDF), tope 8MB; las URLs de fotos en reseñas/obras/DNI se validan contra el patrón `/uploads/...`.
- **Cabeceras**: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` en todas las respuestas; `CSP: default-src 'none'; sandbox` en `/uploads/*` (los archivos subidos nunca se ejecutan como documento activo). Para el dominio final, agregá `X-Frame-Options: SAMEORIGIN` en el reverse proxy si no vas a embeber la app.
- **Política de contraseñas**: mínimo 8 caracteres combinando letras y números (validado en UI y API).
- **Recomendado a futuro**: rotar `AUTH_SECRET` si alguna vez se filtró, y mover el rate limit a Redis si escalás a múltiples instancias.

## 6. Checklist previo al lanzamiento

- [ ] `.env` con `AUTH_SECRET`, `DATABASE_URL` absoluta y `MP_ACCESS_TOKEN`
- [ ] `npm run build` sin errores + `npm start` y probar login con una cuenta real
- [ ] DNS + HTTPS apuntando al servidor (cookies Secure se activan solas)
- [ ] Webhook de MP apuntando al dominio público
- [ ] Backup programado de `db/custom.db` y `public/uploads/`
- [ ] Correr `bash scripts/prod-smoke.sh` (API) y `bash scripts/prod-e2e.sh` (visual) apuntando a `BASE=https://tu-dominio` — ambos deben dar 0 fails

## 6. Cuentas demo (para probar todo antes de lanzar)

`cliente@homia.test` · `profesional@homia.test` · `proveedor@homia.test` — password `Homy2026!`
(ver `CREDENCIALES-DEMO.txt`). **Eliminá o cambiá estas cuentas antes de lanzar a usuarios reales.**

## Lección ops (T30): el server que no muere
- El proceso standalone se renombra a `next-server (v1)`: `pkill -f "standalone/server.js"` NO lo encuentra. Un server viejo sigue en el puerto sirviendo HTML que referencia chunks de un build anterior (500 en los chunks → "Application error" o "Cargando…" eterno). Parece bug de la app y no lo es.
- Regla: para reiniciar, matar SIEMPRE por puerto (`ss -tlnp | grep :3100` → `kill -9 <pid>`) y verificar que el chunk referenciado por el HTML exista en disco antes de considerar el deploy sano.
