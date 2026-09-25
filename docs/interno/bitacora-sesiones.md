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

## 2026-09-24 — Calendario del profesional y acuerdo de fechas del trabajo (D21) (Leonardo)

Con el presupuesto aprobado el profesional propone inicio y fin estimado, el cliente acepta/rechaza/contrapropone, se puede reprogramar (lo acordado sigue vigente), el solapamiento avisa sin bloquear; pantalla Panel → Calendario y "Disponibilidad" anónima en el perfil público; Homy conoce la próxima fecha libre. Migración `0031_calendario_profesional.sql` aplicada (8 columnas nullable + índice, diff vacío). E2E Q 60/60, unitarias 9/9, visual 26/26, purga verificada. Detalle: `decisiones.md` D21, `FUNCIONAL` 2.5/3.5/3.15/3.16, `LOGICA` §3.6/§13, `TECNICO` §4.7/§5/§9, `AGENTS.md` §6. Rama `feat/recuperar-mails`, sin commit.

## 2026-09-24 — Recuperar contraseña y avisos por mail (revisión de lanzamiento)

Una línea: D18 en `decisiones.md`; migración `0028` aplicada (`PasswordReset` + `User.emailNotifications`, solo aditiva); FUNCIONAL "Lo básico para todos", 1.7, 2.12, 3.13, 4.10; LÓGICA catálogo (auth y `PUT /profiles/me`) y §14.1; TÉCNICO §3, §4.10, §5, §7, §9, §11. Pruebas: E2E A+B+F 286/286 con doble de Resend, A 126/126 sin clave, unitarias 10/10, visual 73/73. **Pendiente de Leonardo:** cuenta de Resend, dominio `somoshomia.com` verificado y `RESEND_API_KEY`/`EMAIL_FROM` en `.env` y Vercel (sin eso no sale ningún mail).

---

## 2026-09-24 — Términos al registrarse, "Eliminar mi cuenta", demo oculto al lanzar, imagen para compartir y página de error (Leonardo, revisión de lanzamiento)

Una línea: D19 y D20 en `decisiones.md`; migración `0029` aplicada (3 columnas nullable en `User`); FUNCIONAL "Lo básico para todos", 1.7, 2.12, 3.13, 4.10; LÓGICA §1.1-1.2 y catálogo; TÉCNICO §3, §4.9, §5, §7. **Pendiente de Leonardo:** `HIDE_DEMO_USERS=1` en Vercel el día del lanzamiento, datos `NEXT_PUBLIC_LEGAL_*` y revisión de un abogado.

---

## 2026-09-25 — Fotos que no subían y catálogo ampliado (Leonardo)

"cuando quiero subir una foto de perfil me dice 'no se pudo subir la foto', es mejor que especifique porque" → causa: Vercel corta > 4,5 MB (413 HTML) y los componentes mostraban un mensaje genérico. `subirImagen()` en las 11 pantallas con fotos (TÉCNICO §4.11). Catálogo: expansión 3 cargada en producción (546 nuevos → 1764, 0 actualizados, stock intacto 46); `canonicalCategoria` por palabra completa; `catalogScore`; texto de la home "más de 1.700 materiales".

## 2026-09-25 — Titular de HomIA en las páginas legales y mails con Resend (Leonardo)

"ya cargue la api de resend y el dominio para los emails (por ahora). mi nombre completo es Leonardo Osterrietch, mi cuit es 20398335628, no pongas domicilio" + "mejor usar de email: business@vakdor.com" → `TITULAR` en `legal-content.ts`; Privacidad §1 remite al titular. Resend: el dominio verificado es `vakbot.vakdor.com` (no `somoshomia.com`) → remitente por defecto `avisos@vakbot.vakdor.com`. Prueba real con `sendEmail`: entregado (Resend `last_event: delivered`). Producción respondía 503 `needsConfig` antes del deploy (la clave no llegaba a las funciones). Pedido: "cuando terminemos conformes con las pruebas se borran los datos/cuentas demo" (AGENTS §11).
"usar una plantilla con colores de marca y logo para los emails, en español" → plantilla nueva en `renderEmail` (TÉCNICO, envío de mails) + logos PNG en `public/email/`; 39/39 unitarias; vista previa revisada en 700 y 390 px (se corrigieron el CUIT y el `$` que se cortaban).
"el logo no se ve en el email, se ve el tipico espacio sin nada renderizado" → la URL respondía bien (también como proxy de Gmail/Outlook), pero depende de que el correo la descargue: ahora el logo va incrustado (adjunto inline `cid:homia-logo`, `src/lib/email-logo.ts`). Resend: entregado, adjunto `inline` con `content_id` correcto. 11/11 unitarias del mail.

## 2026-09-25 — Textos legales sin abogado (Leonardo)

"no voy a poner un abogado" → D22 actualizada: los textos de `legal-content.ts` quedan como versión vigente; se sacaron las notas de "revisar con un abogado" (código, FUNCIONAL 1.9, AGENTS §11). Pendientes de Leonardo: Resend y datos de la empresa (`NEXT_PUBLIC_LEGAL_*`); `HIDE_DEMO_USERS=1` el día del lanzamiento (confirmado).

## 2026-09-24 — Integración de los tres equipos: recuperar contraseña y mails (D18), términos, baja y demo oculto (D19-D20), calendario (D21)

**Lo hecho al integrar (revisión propia de los informes):** "Olvidé mi contraseña" sin servicio de mail ya no promete un link (503 honesto, sin tokens); un chat existente no acepta mensajes a una cuenta eliminada (409, una consulta); la prueba I usa un cliente propio (el chat C↔V ya lo abría la compra de la sección A); la sección A prueba los dos casos nuevos. Verificado el `BUG-A-PROPOSITO` de `notify.ts`: ya no está. `tsconfig.json` sin cambios. tsc, eslint, 38 tests unitarios y `next build` verdes; suite completa contra el build: A-Q 1048/1049, la falla era de la prueba nueva (email del actor con mayúscula) → I 38/38, purga verificada. Merge `54eca7e` a main y deploy. **Verificado en producción:** header, footer, menú móvil y legales 47/47 en 1280 y 390, secciones de la home desde pantallas internas 19/19, `og:image` 200 `image/png`, recuperar contraseña 503 honesto, calendario sin sesión 401.
**Pendiente de Leonardo:** Resend (`RESEND_API_KEY`, `EMAIL_FROM`), datos de la empresa (`NEXT_PUBLIC_LEGAL_*`), `HIDE_DEMO_USERS=1` el día del lanzamiento, revisión legal; decidir si el perfil del profesional se abre a visitantes sin cuenta (hoy exige sesión, por eso el visitante no ve la Disponibilidad).

## 2026-09-24 — Header y footer que no llevaban a su sección; páginas legales detalladas (Leonardo)

**El pedido:** "las paginas del header (directorio, materiales y ayuda) no llevan a su apartado!!! (ej. https://www.somoshomia.com/#/directorio) queda en la home. ademas, todas las secciones del footer que tengan link deben llevar al apartado correspodiente" y "crear una pagina en el footer … sobre politica de privacidad y terminos y condiciones … lo mas claro, transparente y detallado posible".
**Lo medido:** reproducido en producción con Playwright: estando en la home, ir a `/#/directorio` (tipeado, pegado o link no interceptado) deja la home en pantalla; también logo → home → header. Los 3 links de Ayuda del footer iban al principio de la Ayuda.
**Causa real:** `SpaRedirect` solo miraba el hash al montar; `spaMounted` quedaba en `true` al salir de la SPA con el logo. Encontrado además al recorrer el menú móvil: desde cualquier pantalla interna, Cómo funciona / Motor IA / Beneficios / Comunidad (menú y footer) mostraban "Esta página no existe" → `irASeccionHome` (19/19 OK).
**Lo hecho:** `spa-redirect.tsx` escucha `hashchange`; `router.tsx` `unmarkSpaMounted`/`isSpaMounted`; `app-root.tsx` desmarca al desmontarse; Ayuda por tema (`?tema=`); footer apunta a cada tema; legales reescritos (D22). TÉCNICO §2, §4.8 y trampas; FUNCIONAL 1.8-1.9; LÓGICA "Textos legales". Verificado en dev 1280/390, todos OK.
**Qué mirar:** después del deploy, repetir la prueba contra `https://www.somoshomia.com` (`scratchpad/pw/nav-local.mjs <url>`).
**Pendiente:** datos de la empresa (`NEXT_PUBLIC_LEGAL_*`) y revisión de un abogado.
**Suite completa (build de producción, puerto 3071):** 908/909, purga verificada. La única falla (J: faltan `proyecto_creado`, `message` del cliente) era de la prueba: la API de notificaciones devuelve las últimas 50 y en la corrida A-P el cliente junta más; ahora los tipos se cuentan en la base (`e2e-integral.mjs`).

## 2026-09-24 — Mensajería rápida, atajos a reseñas, stock con scroll y Cobros del profesional (Leonardo)

"La mensajería tarda en cada movimiento" → causa: con el pooler cada consulta Prisma = ~4 idas a la base y `connection_limit=1` encola; bandeja/hilo hacían 6–7 consultas (la bandeja traía todos los mensajes), cada clic re-montaba panel y pantalla, `/api/auth/me` ×3 al arrancar. Ahora 1 consulta por endpoint, cursor `?after=`, envío optimista, memoria entre montajes, `/me` ×1; índice `Conversation.userBId` (migración `0026`, aditiva, aplicada). Medido (390×844, dev compartido): abrir bandeja 5,6 s/6 req → 2,0 s/3 req; abrir hilo 4,6 s/4 req → 1,5 s/1 req; enviar → burbuja en 50 ms (antes esperaba el POST, 5 req); volver a Mensajes desde otra pantalla 0,14 s; polling 12 s 9 → 7 req (4–9 s c/u → ~1 s). Además: atajo "★ 4,5 · N reseñas" en perfiles y reputación del cliente (botón 44 px), catálogo del proveedor en caja con scroll (60 % de pantalla), Cobros del profesional (`/panel/profesional/cobros`, `GET /api/invoices?mine=1`, OAuth vuelve ahí). E2E A,B,D,E,F,G,I,N 663/663; visual 390 y 1280 38/38 c/u. Detalle: `TECNICO` §4.5, `LOGICA` §3.5/§10/§12.1/§13, `FUNCIONAL` 1.5/2.10/3.8/3.13/3.15/4.12, `AGENTS.md` §6/§7. Rama `feat/carrito-homy`, sin commit.

## 2026-09-24 — Contratar eligiendo un trabajo publicado o un proyecto activo (D16) (Leonardo)

Asistente "Contratar" con selector "¿Es para algo que ya publicaste?" (trabajos abiertos del cliente / proyectos activos del profesional para subcontratar), cierre del trabajo compartido con aceptar oferta (`src/lib/job-hire.ts`), `Project.parentProjectId` (migración `0027` aplicada) y `GET /api/projects/hire-sources`; detalle en `decisiones.md` D16, `FUNCIONAL` §2.4 y §3.4, `LOGICA` §2 y §3.1, `TECNICO` §4.4. Rama `feat/carrito-homy`, sin commit.

## 2026-09-24 (noche) — Compra directa sin aprobación; las reservas las aprueba el proveedor, con o sin stock (D15) (Leonardo)

Decisión D15 implementada en `feat/carrito-homy` (sin commit): las compras con stock nacen "por pagar" con el stock reservado y el cobro emitido (24 h para pagar o elegir efectivo; 7 días con efectivo), las reservas las aprueba el proveedor (sin stock: fecha aproximada → "disponible" → 48 h), lo sin stock solo se reserva, el proveedor cancela con motivo (reembolso total por MP con su token si ya estaba pagado) y en `/buscar` cada material se agrega al carrito o se reserva sin salir de la búsqueda. Migración `0025_compra_directa.sql` aplicada (una columna nullable, diff vacío). Detalle en `decisiones.md` (D15), `LOGICA-HOMIA.md` §4, `TECNICO-HOMIA.md` §4.3, `FUNCIONAL-HOMIA.md` 1.2/1.4/2.7/3.9/4.3 y `AGENTS.md` §6/§7.

---

## 2026-09-24 (noche) — Sobrantes: devuelve la plata quien la cobró (D14) (Leonardo)

Decisión D14 implementada en `feat/carrito-homy` (sin commit): en modo `pro_adelanta` la devolución del cliente es con el profesional (acepta, recibe, reembolsa por MP desde su cuenta o en efectivo; sin stock de proveedor) y pata nueva opcional profesional → proveedor con reembolso por fuera de HomIA. Migración `0024_sobrantes_profesional.sql` aplicada (solo aditiva, diff vacío). Suite E2E completa 785/785 (G: 124/124), recorrido visual 390×844 y 1280×800 81/82 (la X de 16 px del `Dialog` global de shadcn), purga verificada. Detalle en `decisiones.md` (D14), `LOGICA-HOMIA.md` §12.2, `TECNICO-HOMIA.md` §4.2, `FUNCIONAL-HOMIA.md` 2.8/3.14/4.5 y `AGENTS.md` §7.6.

---

## 2026-09-24 (tarde) — Carrito multiproveedor, cargo 1% al cliente, cobro a la cuenta del vendedor y súper agente Homy; documentos completados (Leonardo)

**El pedido:** cerrar las decisiones D6–D10 y D13 (carrito, 1% lo paga el cliente solo por MP,
plata a la cuenta del vendedor, Homy con `gpt-5.6-luna` y cupos) y completar los tres documentos y
`AGENTS.md` con el código real.

**Lo hecho:**

| Qué | Dónde |
|---|---|
| Commit `2eed864` en `feat/carrito-homy` (sin mergear a `main`): carrito para visitantes (localStorage, se fusiona al ingresar), clientes y profesionales; `Order` con un sub-pedido por proveedor; "Mis pedidos" con pago de a uno y línea de tiempo; `createSellerPreference` con token del vendedor y `marketplace_fee` 1%; "Cobrá con tu Mercado Pago" para el profesional; sobrantes por ítem sin reembolsar el 1%, confirmación del efectivo y recordatorio de 72 h; fuga de tokens OAuth en `GET /api/projects/[id]` corregida; súper agente Homy (Responses API, herramientas solo lectura, guardarraíles y ranking en código, cupo en `AiUsage`, `HomyRun`); regla del chat por destinatario (D13); `/api/*` inexistente → 404 JSON; migraciones 0022, 0023 y 0030 aplicadas | `git show --stat 2eed864` |
| **Publicado en producción** (`b4665fb`, merge fast-forward de `feat/carrito-homy` a `main` con OK de Leonardo). Región `gru1` confirmada; tiempos 5 a 20 veces menores (TÉCNICO §4.6); smoke OK: home, 404 JSON de API, 401 de carrito/pedidos/facturas/hire-sources, crons, sponsors, Homy visitante en streaming | producción |
| Integración tras los equipos de D15/D16/mensajería: navegación del panel sin recargas (`router.tsx`, `markSpaMounted`); sesión en una consulta (`auth.ts`); botón de Homy oculto con ventanas abiertas (`help-dock.tsx`); "Profesionales que contrataste" (`projects` GET `contratados`, `profesional/proyectos.tsx`); Reservar en perfil de proveedor sin stock; pestañas de 44 px; avisos de pedido en paralelo; región `gru1` (D17). Ver TÉCNICO §4.6 | commits de la rama |
| Pedido de Leonardo al probar en dev: cinta de sponsors con cada proveedor una vez por vuelta, banda azul oscuro y logo/marca sutiles (`sponsors.tsx`, vista previa en `proveedor/perfil.tsx`); desde la home, los clics en tarjetas de Homy ahora navegan de verdad a registro/secciones (`router.tsx`). Verificado con Playwright en 1280 y 390 (3 corridas) | `scratch/verif-final/` |
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
