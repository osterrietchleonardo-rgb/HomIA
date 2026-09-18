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
npm run build        # compila y arma .next/standalone (copia static/ y public/)
npm start            # arranca el servidor standalone en el puerto 3000
```

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
- La suscripción PRO funciona para **proveedores y profesionales** (misma lógica, `external_reference = pro:<rol>:<id>`; el webhook activa el plan y notifica).

## 5. Checklist previo al lanzamiento

- [ ] `.env` con `AUTH_SECRET`, `DATABASE_URL` absoluta y `MP_ACCESS_TOKEN`
- [ ] `npm run build` sin errores + `npm start` y probar login con una cuenta real
- [ ] DNS + HTTPS apuntando al servidor (cookies Secure se activan solas)
- [ ] Webhook de MP apuntando al dominio público
- [ ] Backup programado de `db/custom.db` y `public/uploads/`
- [ ] Correr `bash scripts/prod-smoke.sh` (API) y `bash scripts/prod-e2e.sh` (visual) apuntando a `BASE=https://tu-dominio` — ambos deben dar 0 fails

## 6. Cuentas demo (para probar todo antes de lanzar)

`cliente@homia.test` · `profesional@homia.test` · `proveedor@homia.test` — password `Homy2026!`
(ver `CREDENCIALES-DEMO.txt`). **Eliminá o cambiá estas cuentas antes de lanzar a usuarios reales.**
