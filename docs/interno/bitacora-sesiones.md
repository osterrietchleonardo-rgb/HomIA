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

## 2026-09-25 — Integración de los siete equipos y arreglo de la numeración de pedidos (Leonardo)

**Lo hecho:** commit `a5f0f27` (calendario D23, finanzas D24, sugerencias D25, registro D26, métricas D27, `/admin` D29, ingresos D30) + merge de `main`. Suite E2E completa con un solo server y nada en paralelo: **1454/1455** (la única falla, S "mail al equipo", era del arranque del server sin `FEEDBACK_EMAIL` de prueba). Unitarias 141/141 + 4 nuevas. **Causa real** del 503 "No pudimos numerar tu pedido" que vieron los equipos: la numeración salía de `count()+1` y un borrado la hacía chocar siempre; ahora sale del mayor número del año (TÉCNICO §4.18). Homy y el tour no se muestran en `/admin`.

## 2026-09-25 — Ingresos de HomIA en /admin: cada cobro de suscripción y el 1%, con estado de cuenta de cada proveedor (D30) (Leonardo)

"donde llega el pago de suscripcion de los proveedores? … la agregas en mi /admin?" → confirmado que llega a su cuenta de MP (misma cuenta de las dos apps); `SubscriptionCharge` + `SubscriptionEvent` + `Payment.mpApplicationFee` (migración `0037` aplicada), webhook `subscription_authorized_payment`, reconciliación en el cron, backfill con `--dry-run` (producción: 1 suscripción pendiente, 0 cobros; prueba: 1 cobro aprobado de $50.000, no se guarda), pantalla `/admin/ingresos`. Tests 24/24, E2E U 33/33, visual 38/38. Detalle en FUNCIONAL (Ingresos de HomIA), LÓGICA §19, TÉCNICO §4.17 y D30. Pendiente: evento "Planes y suscripciones" en Webhooks de la app Suscripciones y el backfill con OK.

## 2026-09-25 — Finanzas del profesional y del proveedor (D24) (Leonardo)

Pantalla Panel → Finanzas (Resumen, Resultados, Caja, Balance, Movimientos, Aprendé), lo de HomIA automático, carga manual con explicación de cada categoría, primer uso de 3 pasos, CSV. Migración `0033_finanzas.sql` aplicada (2 tablas + `ProviderStock.unitCost`, diff vacío después). Unitarias 117/117 (finanzas 20), E2E R 97/98 en la corrida completa (la falla era de la prueba; corregida), visual 46/46 pantallas en 390 y 1280 sin desbordes ni NaN. Detalle: `decisiones.md` D24, FUNCIONAL "Finanzas", LÓGICA §16, TÉCNICO §4.12/§9, AGENTS §3/§5/§6. Rama `feat/horas-y-logo`, sin commit.

## 2026-09-25 — Métricas de uso de todos los usuarios y área /admin con ingreso propio (D27, D29) (Leonardo)

"todo tiene que estar registrado, cada accion, cada boton…" y "es mejor iniciar sesion de una con mi admin_email y admin_password (en .env) en /admin" → registro propio de uso (`AnalyticsEvent`/`AnalyticsSession`, migración `0036` aplicada, `POST /api/analytics/collect`, tracker en AppRoot y home, eventos de servidor de login/logout/registro/plan/PDF/admin) + panel `/admin/metricas` (usuarios, uso, embudos, retención, negocio, fichas por usuario y activo, CSV) + área `/admin` con ingreso `ADMIN_EMAIL`/`ADMIN_PASSWORD` (Métricas y Sugerencias; `/panel/admin/*` redirige) + Privacidad `LEGAL_VERSION` 2026-09-25. Cargo 1% en función compartida `src/lib/ingresos.ts` (para la futura sección Ingresos). Pruebas: unitarias 14 + 5, E2E T 94/94 y A 151/151. Detalle en FUNCIONAL (Métricas y Área /admin), LÓGICA §17-§18, TÉCNICO §4.15-§4.16, decisiones D27/D29. Botones de pantallas de otros equipos sin `data-track` (se miden igual por texto/aria-label y por la API): integrar con la regla 11 de AGENTS.md. Pendiente: `ADMIN_EMAIL`/`ADMIN_PASSWORD` en Vercel y regla de Firewall para `/api/admin/login`.

## 2026-09-25 — Registro estandarizado con email confirmado por código para los 3 roles (D26) (Leonardo)

"usar la estandarizacion y doble verificacion de email y celular al cargar el formulario de registro de los 3 roles…" → registro en 4 pasos, datos estandarizados (`src/lib/registro.ts`, `libphonenumber-js`), código de 6 números por mail antes de crear la cuenta, celular escrito dos veces (código por SMS/WhatsApp solo con proveedor: hoy ninguno), tarjeta "Email y celular" en Mi perfil, `auth/register` con zod. Migración `0035` (solo aditiva) aplicada. Detalle: decisiones D26, FUNCIONAL 1.7/2.12, LÓGICA §1.3, TÉCNICO §4.14. Pruebas: unitarias 79/79, E2E A 189/189 con doble de Resend (suite completa 1336/1377: las 41 fallas en B/F/J/P/R no tocan el registro, ver informe), visual 144/144 (390 y 1280), purga verificada (0 usuarios y 0 códigos `e2e-reg-*`). **Falta:** contratar Twilio o WhatsApp Cloud API para verificar celulares (Leonardo).

## 2026-09-25 — Sugerencias en los tres roles con fotos y bandeja del administrador (D25) (Leonardo)

"agrega otro agente, para que agreguen otra seccion/pagina en los 3 roles, 'sugerencias' …" → Panel → Sugerencias (cliente, profesional, proveedor) + `/panel/admin/sugerencias` (admin por `ADMIN_EMAILS`). Migración `0034` (tabla `Feedback`, solo aditiva) y bucket privado `feedback-evidencias` creados en producción. Detalle: decisiones D25, FUNCIONAL "Sugerencias", LÓGICA §15, TÉCNICO §4.13. Pruebas: unitarias 8/8 (57/57 con el resto), E2E A+S 136/136 + 67/67 con doble de Resend, visual 52/52 (390 y 1280), purga verificada (0 usuarios `e2e-sug-*`, 0 `Feedback`, bucket vacío). **Falta:** `ADMIN_EMAILS` en Vercel (Leonardo).

## 2026-09-25 — Fotos que no subían y catálogo ampliado (Leonardo)

"cuando quiero subir una foto de perfil me dice 'no se pudo subir la foto', es mejor que especifique porque" → causa: Vercel corta > 4,5 MB (413 HTML) y los componentes mostraban un mensaje genérico. `subirImagen()` en las 11 pantallas con fotos (TÉCNICO §4.11). Catálogo: expansión 3 cargada en producción (546 nuevos → 1764, 0 actualizados, stock intacto 46); `canonicalCategoria` por palabra completa; `catalogScore`; texto de la home "más de 1.700 materiales".

## 2026-09-25 — Horario en las fechas del trabajo: varios trabajos el mismo día sin pisarse (D23) (Leonardo)

**El pedido:** "las fechas del calendario de los profesionales, pueden repartirse entre obras/proyectos, por eso se tendria que poder agregar hora en la fecha de inicio y fin. porque si de 7am a 12pm hace un proyecto pero despues de 2pm a 7pm hace otro, se tendria que poder visualizar en el calendario y no pisarse." Después: "la jornada de trabajo generalmente empieza desde las 6am a 18pm, como referencia, pero puede setearse otros horarios tranquilamente".
**Lo hecho (rama `feat/horas-y-logo`, sin commit):** franja horaria diaria por proyecto y jornada por profesional (migración `0032`, solo aditiva, aplicada); choque con acordados → 409, con propuestas → aviso; calendario con agenda del día y "Mi jornada"; disponibilidad pública por día (libre / con lugar / completo). Detalle en decisiones D23, FUNCIONAL 3.15 y 3.16, LÓGICA §3.6 y TÉCNICO §4.7.1. Pruebas: unitarias 19/19 + Homy 19/19, E2E Q 107/107, visual 30 capturas, purga verificada.
**Qué NO se tocó:** `src/lib/email.ts`, `email-logo.ts`, `email.test.ts` (otra terminal); el modelo `Feedback`/`0034` y `src/lib/finanzas/` que aparecieron en el árbol durante la sesión (otra terminal).

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
