# Bitácora de sesiones — HomIA

## Cómo se usa

- Es la **primera lectura de cada sesión** del agente (no es para el dueño).
- **Al empezar:** leer las últimas 3 entradas.
- **Al terminar algo importante:** agregar la entrada del día **arriba de todo**. Si el día ya
  tiene entrada, se le suma.
- **No duplicar:** lo que tiene archivo propio (funcional, lógica, técnico, decisiones) se cambia
  allí, y acá va una línea que lo dice. La bitácora es un índice de lo que pasó.
- Formato de cada entrada:

```
## AAAA-MM-DD — <resultado en lenguaje llano> (quién lo pidió)

**El pedido:** la cita textual.
**Lo medido antes de tocar nada:** tabla con números de producción.
**El caso que lo explica:** un ejemplo real, anonimizado.
**Causa real:** …
**Lo hecho:** archivos, commit del merge, qué NO se tocó, backup previo.
**Qué mirar mañana:** la línea de base numérica contra la que se juzga.
**Pendiente:** …
```

(Formato del PLAYBOOK §9.2.)

---

## 2026-09-24 (tarde) — Carrito multiproveedor, cargo 1% al cliente, cobro a la cuenta del vendedor y súper agente Homy; documentos completados (Leonardo)

**El pedido:** cerrar las decisiones D6–D10 y D13 (carrito, 1% lo paga el cliente solo por MP,
plata a la cuenta del vendedor, Homy con `gpt-5.6-luna` y cupos) y completar los tres documentos y
`AGENTS.md` con el código real.

**Lo hecho:**

| Qué | Dónde |
|---|---|
| Commit `2eed864` en `feat/carrito-homy` (sin mergear a `main`): carrito para visitantes (localStorage, se fusiona al ingresar), clientes y profesionales; `Order` con un sub-pedido por proveedor; "Mis pedidos" con pago de a uno y línea de tiempo; `createSellerPreference` con token del vendedor y `marketplace_fee` 1%; "Cobrá con tu Mercado Pago" para el profesional; sobrantes por ítem sin reembolsar el 1%, confirmación del efectivo y recordatorio de 72 h; fuga de tokens OAuth en `GET /api/projects/[id]` corregida; súper agente Homy (Responses API, herramientas solo lectura, guardarraíles y ranking en código, cupo en `AiUsage`, `HomyRun`); regla del chat por destinatario (D13); `/api/*` inexistente → 404 JSON; migraciones 0022, 0023 y 0030 aplicadas | `git show --stat 2eed864` |
| Cambios del mismo día (incluidos en `2eed864`): header público con menú completo desde 1280 px y hamburguesa por debajo, textos sin partir (`site-header.tsx`); panel móvil con `pb-44` para que el botón de Homy no tape el final (`panel-layout.tsx`) | `2eed864` |
| Verificación (informes de los equipos): E2E 16 secciones A–P **727/727**; A+I **69/69** tras el cambio del chat; Homy **32/32** en el set de evaluación, 0 alucinaciones, 19 tests; build de producción verde | `scripts/e2e-integral.mjs`, `scripts/homy-eval.mjs` |
| Documentos: secciones EN CONSTRUCCIÓN completadas en funcional, lógica y técnico; decisiones D6–D10 pasadas a implementadas y D3 actualizada; pendiente nuevo anotado; `AGENTS.md` reescrito sin las discrepancias que listaba `docs/README.md` | `docs/`, `AGENTS.md` |

**Qué NO se tocó:** código (esta tarea fue solo documentación), la base, ramas.

**Qué mirar mañana:** un pago real de prueba de punta a punta con OAuth del vendedor (compra,
factura y cobro) para confirmar que el webhook acredita con la pista `?ref=`; el costo real de Homy
en la factura de OpenAI contra el estimado (≈ US$0,001/consulta).

**Pendiente:** decidir quién reembolsa los sobrantes de materiales facturados por el profesional y
pagados por MP (hoy sale de la cuenta del profesional; `decisiones.md`). Merge de
`feat/carrito-homy` a `main` con OK de Leonardo.

## 2026-09-23/24 — Auditoría integral, plan de lanzamiento, arreglos de Mercado Pago, plan PRO y documentación en tres partes (Leonardo)

**El pedido:** dejar HomIA lista para lanzar en 48 h con los tres roles operando con dinero real,
sin promesas falsas; después, registrar todo en tres documentos (funcional, lógica, técnico).

**Lo medido antes de tocar nada:** la auditoría del 23/09 (`docs/AUDITORIA-INTEGRAL.md`, §1–§2)
encontró que el código no compilaba en TypeScript (6 errores, escondidos con
`ignoreBuildErrors: true`), que el pago de compras directas era inalcanzable, que el stock nunca se
reservaba, que el webhook de MP no verificaba firma ni era idempotente, que la verificación de DNI
no corría en Vercel y que el panel móvil no llegaba a varias secciones.

**Lo hecho (en orden, hashes verificados con `git log --oneline`):**

| Commit | Rama | Qué |
|---|---|---|
| `288f9a0` | main | Plan de lanzamiento: compra directa completa (reserva atómica, cobro, pago por OAuth del proveedor con 1% o efectivo, entrega, vencimientos por cron); webhook con firma, idempotencia y validación de monto; refresh del OAuth; planes en ARS con prueba real; máquina de estados del proyecto con cotización del profesional y factura única; **sobrantes**; DNI en bucket privado; IDORs cerrados; copy sin escrow ni visitas IA; barra móvil con "Más"; build estricto |
| `d98b549` | main | Webhook: no descartar avisos sin firma de la app y buscar el pago en ambos entornos |
| `55b5e3a` | main | Suscripción del plan fallaba en producción: `reason` > 60 caracteres; `back_urls` sin `#` |
| `68fc541` | main | Webhook: buscar la suscripción también en el otro entorno (prueba ↔ producción) |
| `0bcedf4` | main | OAuth MP: autorizar en `auth.mercadopago.com.ar` para no pedir el país |
| `2a8cd95` | main | OAuth MP con PKCE S256 (migración `0020`) |
| `308d74b` | main | Orden de carpetas: restos del sandbox fuera del repo, documentos a `docs/` y `docs/historico/`, `scripts/` agrupado |
| `1a92f9c` | main | README: arranque con la base única, precios en pesos, sin escrow |
| `48668f3` | `feat/pro-sponsors-qa` (sin mergear a main; también es la base de `feat/carrito-homy`) | Plan PRO con marca (logo, frase, color; migración `0021`) y cinta de sponsors; `esProActivo()` como única fuente de "Recomendado"; cambio de plan sin bloqueo; cron diario `/api/cron/subscriptions`; prueba integral `scripts/e2e-integral.mjs` (612/615) y visual `scripts/e2e-visual.mjs`; 25 bugs corregidos |

**Documentación creada hoy (esta rama, sin commit):** `docs/README.md`,
`docs/compartible/estandarizada/FUNCIONAL-HOMIA.md`, `docs/interno/LOGICA-HOMIA.md`,
`docs/interno/TECNICO-HOMIA.md`, `docs/interno/decisiones.md` y esta bitácora. Todo sale del código
de `48668f3`. Decisiones del 23–24/09 registradas en `decisiones.md` (D1–D12).

**En curso en la rama `feat/carrito-homy` (dos equipos en paralelo):**
- Carrito multiproveedor, pedidos, línea de tiempo, cargo de servicio del 1% al cliente solo por
  Mercado Pago y cobro a la cuenta del vendedor (working tree: `src/lib/fees.ts`, `orders.ts`,
  `activity.ts`, `units.ts`, `prisma/schema.prisma`, migración `0022_carrito_pedidos.sql`).
- Súper agente Homy nuevo (`gpt-5.6-luna`, cupos 8/día por IP y 60/día por usuario; working tree:
  `src/lib/homy/`, migración `0030_homy_superagente.sql`).
- El equipo de carrito además sumó `src/app/api/cart/`, `src/app/api/orders/`,
  `src/lib/cart-server.ts`, `order-view.ts`, `seller-pay.ts` y está modificando rutas de cobros,
  facturas, compras, sobrantes, OAuth y webhook.
- Las secciones marcadas **EN CONSTRUCCIÓN** en los tres documentos se completan con sus informes.

**Qué NO se tocó:** ningún archivo de código, AGENTS.md ni la base.

**Qué mirar mañana:** que la migración `0022` se aplique con `prisma db execute` (no `db push`) y
con OK; que al cerrar los equipos se actualicen las secciones EN CONSTRUCCIÓN.

**Pendiente (hallazgos anotados, no propuestas):**
- Regla "el cliente inicia" no se cumple para profesionales y proveedores registrados por la app,
  porque todos tienen rol cliente (`LOGICA-HOMIA.md` §10).
- El aviso "Factura pagada" lleva a una página que no existe (`LOGICA-HOMIA.md` §14).
- El webhook no recibe el atajo `?ref=purchase:` que espera: verificar con un pago real de compra
  directa (`TECNICO-HOMIA.md` §6.1).
- Discrepancias entre AGENTS.md y el código listadas en `docs/README.md`.
