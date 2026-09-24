# HomIA — Lógica del sistema (reglas de negocio)

> **Para qué sirve:** el sistema completo como reglas de negocio: quién puede qué, estados y
> transiciones, montos y comisión, stock, planes, mensajería, reseñas, verificación, IA, crons y el
> catálogo de endpoints. La ingeniería está en [`TECNICO-HOMIA.md`](./TECNICO-HOMIA.md); cómo lo usa
> cada rol, en [`../compartible/estandarizada/FUNCIONAL-HOMIA.md`](../compartible/estandarizada/FUNCIONAL-HOMIA.md).
>
> **Fuente:** código de la rama `feat/carrito-homy`, commit `2eed864` (24/09/2026: carrito y
> pedidos, cargo de servicio 1%, cobro a la cuenta del vendedor, súper agente Homy, regla del chat
> por destinatario). Cada regla lleva `archivo:línea` (rutas bajo `src/app/api/` se abrevian sin ese
> prefijo).

---

## 1. Roles y permisos

- **Tres roles**: `cliente`, `profesional`, `proveedor`, guardados como lista JSON en `User.roles`
  (`prisma/schema.prisma:21`). Un usuario puede tener varios.
- **Qué rol recibe cada alta:**
  - Por la pantalla de registro, **siempre se agrega `cliente`** y, si eligió otro, se suma
    `profesional` o `proveedor` (`src/components/screens/auth-register.tsx:137-142`). No se puede
    registrar profesional y proveedor a la vez; no hay forma de sumar un rol después (no existe
    endpoint).
  - La API acepta cualquier combinación de los tres (`auth/register/route.ts:65-68`). Las cuentas
    demo son de un solo rol (`scripts/demo/demo-seed.mjs:16,24,32`).
- **Perfiles:** el registro crea `ProfessionalProfile` si hay rol profesional y `ProviderProfile`
  (con prueba de 14 días) si hay rol proveedor (`auth/register/route.ts:92-130`), y un tablero de
  CRM por defecto (`src/lib/pipelines.ts`).
- **Cómo se chequea el permiso:** casi todas las rutas no miran el rol sino **la existencia del
  perfil** (p. ej. ofertar exige `ProfessionalProfile` — `jobs/[id]/bids/route.ts:69-70`; stock exige
  `ProviderProfile` — `provider/stock/route.ts:99-100`) y **la pertenencia al recurso** (ser cliente
  o profesional del proyecto, dueño del trabajo, cliente o proveedor de la compra). Excepción: el
  alta de catálogo con IA mira el rol `proveedor` (`catalog/route.ts:64`).
- **Panel:** si la URL pide un rol que el usuario no tiene, se lo redirige a su primer rol
  (`src/components/screens/panel/panel-layout.tsx:133-138`).

| Acción | Cliente | Profesional | Proveedor | Visitante |
|---|---|---|---|---|
| Buscar, directorio (lista), materiales (mirar), detalle de trabajo, ayuda | Sí | Sí | Sí | Sí |
| Ver perfil completo de profesional/proveedor | Sí | Sí | Sí | No (401) |
| Hablar con Homy (súper agente) | Sí (60/día) | Sí (60/día) | Sí (60/día) | Sí (8/día por IP) — ver §11 |
| Publicar trabajo | Sí (cualquier usuario logueado) | Sí | Sí | No |
| Ofertar en un trabajo | — | Sí (no en el propio) | — | No |
| Contratar por el asistente | Sí | Sí (subcontratar) | — | No |
| Carrito | Sí | Sí | Solo si también tiene rol cliente | Sí, en su navegador; para confirmar necesita cuenta |
| Confirmar pedidos de materiales | Sí (no a sí mismo) | Sí | Idem | No |
| Conectar su Mercado Pago para cobrar | — | Sí (facturas) | Sí (ventas y cobros) | No |
| Cargar stock, cobrar materiales, plan | — | — | Sí | No |
| Reseñar | Según §9 | Según §9 | No (recibe) | No |

### 1.1 Aceptación de términos y "Eliminar mi cuenta" (D19, 24/09/2026)

**Aceptación al registrarse** (`auth/register/route.ts`):

- `acceptTerms` tiene que ser exactamente `true`; si falta o es otra cosa → **400** "Para crear tu
  cuenta tenés que aceptar los Términos y Condiciones y la Política de Privacidad" con
  `needsTerms: true`, y no se crea nada. Se chequea después de validar email/contraseña/nombre y
  antes del 409 por email repetido.
- Se guarda `User.termsAcceptedAt` (ahora) y `User.termsVersion` = `LEGAL_VERSION` de
  `src/lib/legal-content.ts` (formato `AAAA-MM-DD`). Las cuentas anteriores quedan en `NULL`.
- La pantalla deshabilita **Crear mi cuenta** hasta tildar la casilla; los links a `/terminos` y
  `/privacidad` abren en otra pestaña.

**Eliminar mi cuenta** (`POST /api/profiles/me/eliminar`, `src/lib/account-deletion.ts`) — Ley
25.326, derecho de supresión:

| Paso | Regla | Respuesta |
|---|---|---|
| 1 | Sesión obligatoria | 401 |
| 2 | zod: `confirm` = `ELIMINAR` (exacto, en mayúsculas) y `password` | 400 |
| 3 | Tope: 5 intentos cada 15 min por cuenta (en memoria) | 429 |
| 4 | La contraseña tiene que ser la actual | **403** "La contraseña no es correcta" |
| 5 | **Operaciones abiertas** (ver abajo): si hay alguna, no se toca nada | **409** con `pendientes: [{ tipo, cantidad, texto, ruta }]` |
| 6 | Se borran los archivos del bucket privado `dni-docs/<userId>/`; si Storage falla (o no está configurado y hay documentos), no se toca nada | 503 |
| 7 | **Anonimización en una transacción** + borrado de foto/logo públicos + se borra la cookie | 200 `{ eliminada: true }` |

Operaciones abiertas que bloquean la baja (`operacionesAbiertas`):

| `tipo` | Qué cuenta |
|---|---|
| `proyectos_cliente` / `proyectos_profesional` | `Project.status = activo` como cliente o como profesional |
| `facturas_por_pagar` / `facturas_sin_cobrar` | `Invoice.status = pendiente` como cliente o como profesional |
| `pedidos_cliente` / `ventas_proveedor` | Sub-pedidos en `pendiente_aprobacion`, `esperando_stock`, `aprobado` o `entregado` (entregado = falta el pago), más los `pagado` del carrito sin evento `entregado` en la línea de tiempo |
| `cobros_por_pagar` / `cobros_proveedor` | `ProviderCharge` en `pendiente` o `acordada_efectivo` |
| `devoluciones_pedidas` / `_profesional` / `_proveedor` | `LeftoverReturn` en `solicitada`, `aceptada`, `aceptada_parcial`, `recibida`, `reembolso_fallido`, o `reembolsada` en efectivo/por fuera sin confirmar |
| `suscripcion` | Proveedor con plan `basic`/`pro` y `mpPreapprovalId` (se cancela desde Mercado Pago) |

Qué hace la anonimización (no borra la fila `User`, para no romper el historial de otros):

- **Usuario:** email → `eliminado-<id>@homia.invalid`, nombre → "Usuario eliminado", teléfono,
  foto, cómo nos encontró, cumpleaños, dirección, ciudad, lat/lng → `NULL`, ubicación compartida
  apagada, contraseña → hash de 32 bytes aleatorios, verificación → `none`, avisos por mail
  apagados, `deletedAt` = ahora. **Los roles se conservan.**
- **Se borra:** documentos de DNI (filas + archivos), carrito, favoritos (propios y los que otros le
  tenían), sesiones de Homy, cupo de IA, notificaciones, pedidos de recuperar contraseña, CRM propio.
  `HomyRun` y `SearchEvent` quedan sin `userId`.
- **Trabajos publicados:** los `abierto` pasan a `cancelado`; a todos se les borra la dirección.
  Obras del portafolio → `visible = false`.
- **Profesional:** ofertas `pendiente` → `retirado`; perfil sin bio, DNI/CUIL, datos de empresa,
  habilidades ni ubicación; tokens de Mercado Pago borrados; cuentas de retiro inactivas.
- **Proveedor:** **se borra todo su stock** (sale también de los carritos de otros; los pedidos
  cerrados conservan su copia de cada producto); perfil → "Proveedor eliminado", sin CUIT,
  descripción, dirección, ubicación ni marca; tokens de Mercado Pago borrados; vinculaciones
  inactivas.
- **Se conserva:** facturas, pagos, pedidos y cobros cerrados, devoluciones cerradas, reseñas
  (escritas y recibidas) y mensajes: muestran "Usuario eliminado" / "Proveedor eliminado".
- **Después:** `getSessionUser` ignora la cuenta (la cookie vieja ya no sirve), el login la rechaza
  (401 igual que una contraseña incorrecta), no aparece en ninguna superficie pública (§1.2), su
  perfil público da 404, no se le puede abrir una conversación nueva (404) y en un chat que ya existía no se le pueden mandar mensajes (409 `cuentaEliminada`; la conversación y el estado de las dos cuentas salen en una sola consulta).

### 1.2 Qué se ve en lo público (D20, 24/09/2026)

Un solo helper, `src/lib/visibility.ts` (`whereUsuarioPublico()` / `esUsuarioPublico()`):

- **Cuentas eliminadas** (`deletedAt`): nunca aparecen.
- **Cuentas demo y de prueba** (email terminado en `@homia.test`): no aparecen **solo si
  `HIDE_DEMO_USERS=1`** en el servidor. Sin la variable (o en 0), se ven como siempre. Siguen
  pudiendo iniciar sesión y usar su panel en los dos casos.

Dónde se aplica: `GET /directory` (profesionales y proveedores), `GET /search` (profesionales,
materiales y trabajos, en los dos modos), `GET /search/pins`, `GET /marketplace`, `GET /comparables`,
`GET /sponsors`, `GET /jobs` (bolsa), `GET /jobs/[id]` (404 salvo al dueño y a quien ya ofertó),
`GET /profiles/professional/[id]` y `GET /profiles/provider/[id]` (404 para todos menos el propio
usuario) y las herramientas de datos del agente Homy (`src/lib/homy/datos.ts`: ofertas,
profesionales y trabajos). El aviso "Nuevo trabajo en tu rubro" tampoco se manda a cuentas
eliminadas.

---

## 2. Trabajos publicados (`JobPost`) y ofertas (`JobBid`)

### 2.1 JobPost

Estados: `abierto` → `en_proceso` | `cerrado` | `cancelado` (`prisma/schema.prisma:244`).

| Transición | Quién | Condición | Fuente |
|---|---|---|---|
| (alta) → `abierto` | Cualquier usuario logueado | Título, descripción y rubro obligatorios; rubro tiene que existir; presupuesto ≥ 0 y mín ≤ máx; hasta 6 fotos de HomIA | `jobs/route.ts:81-137` |
| `abierto` → `en_proceso` | Sistema, al aceptar una oferta | Dentro de la transacción de aceptación | `bids/[id]/route.ts` → `closeJobWithHire` (`src/lib/job-hire.ts`) |
| `abierto` → `en_proceso` | Sistema, cuando el dueño contrata directo eligiendo ese trabajo en el asistente "Contratar" (D16) | Trabajo del usuario de la sesión y `abierto` (re-chequeado dentro de la transacción); `selectedBidId` = la oferta pendiente del profesional contratado, o vacío si no había ofertado | `projects/route.ts` (POST con `jobId`) → `closeJobWithHire` |
| `abierto` → `cerrado` / `cancelado` | Dueño | — | `jobs/[id]/route.ts:65-70` |
| `cerrado` / `cancelado` → `abierto` | Dueño | Solo si nunca se aceptó una oferta (`selectedBidId` vacío) | `jobs/[id]/route.ts:93-95` |
| `en_proceso` → `cerrado` | Dueño | La obra sigue por el proyecto | `jobs/[id]/route.ts:69` |

Al publicar se notifica "Nuevo trabajo en tu rubro" a hasta 50 profesionales cuyo oficio coincide
con el rubro (`jobs/route.ts:139-155`). El detalle público esconde la dirección y redondea la
ubicación a ~1 km si no hay sesión (`jobs/[id]/route.ts:30-43`).

### 2.2 JobBid

Estados: `pendiente` → `aceptado` | `rechazado` | `retirado` (`schema.prisma:261`).

| Transición | Quién | Condición | Efecto | Fuente |
|---|---|---|---|---|
| (alta) → `pendiente` | Profesional | Trabajo abierto, no propio; monto > 0 y ≤ 1.000 millones; plazo 1–365 días; mensaje ≤ 2000 | Notifica "Nuevo presupuesto en tu trabajo" | `jobs/[id]/bids/route.ts:61-143` |
| Re-oferta | Profesional | Si ya tenía oferta: pendiente se actualiza; rechazada/retirada vuelve a `pendiente` (notifica "Presupuesto actualizado"); aceptada no se toca (409) | — | `:90-120` |
| `pendiente` → `retirado` | Profesional autor | Solo desde pendiente | — | `bids/[id]/route.ts:34-41` |
| `pendiente` → `rechazado` | Dueño del trabajo | Trabajo abierto | Notifica "Presupuesto rechazado" | `:49-61` |
| `pendiente` → `aceptado` | Dueño del trabajo | Trabajo abierto; re-chequeo dentro de la transacción (dos aceptaciones simultáneas no crean dos proyectos) | Crea el `Project` con `laborCost = monto de la oferta`, copia presupuesto/dirección/fotos; rechaza el resto de las pendientes y avisa a cada uno; trabajo → `en_proceso`; notifica a ambos | `:63-143` |
| `pendiente` → `aceptado` (D16) | Dueño del trabajo, contratando directo con el asistente y eligiendo ese trabajo | El profesional contratado tenía una oferta **pendiente** en ese trabajo | El proyecto nace con `laborCost = monto de la oferta`; al profesional le llega "¡Te contrataron por tu oferta!" | `projects/route.ts` POST |
| `pendiente` → `rechazado` (D16) | Sistema, al contratar directo eligiendo el trabajo | Toda oferta pendiente que no sea la del contratado | Aviso "El cliente contrató a otro profesional para este trabajo" | `closeJobWithHire` |

La lógica común a los dos caminos (oferta elegida `aceptado`, resto de pendientes `rechazado` con
aviso a cada profesional, trabajo `en_proceso` con `selectedBidId`) vive en una sola función,
`closeJobWithHire` en `src/lib/job-hire.ts`, que corre siempre **dentro** de la transacción que crea
el proyecto; `assertJobOpen` re-chequea que el trabajo siga abierto. Si algo falla, no se crea nada.

---

## 3. Proyectos (`Project`)

### 3.1 Cómo nace un proyecto

1. **Aceptando una oferta** de la bolsa: la mano de obra ya viene cotizada (= monto de la oferta)
   (`bids/[id]/route.ts:78`).
2. **Por el asistente "Contratar"** (`POST /api/projects`): la mano de obra arranca en **0 = sin
   cotizar**; el presupuesto del cliente (`budgetMin/Max`) es solo referencia; se guardan urgencia
   (`ya`/`esta_semana`/`normal`), dirección, fecha deseada y hasta 4 fotos; si hay mensaje inicial se
   abre el chat cliente→profesional; se notifica "Te contrataron: cotizá la mano de obra para
   arrancar" (`projects/route.ts:151-272`). El rubro elegido se acepta pero **no se guarda** (no hay
   campo; `projects/route.ts:161-163`).
3. **Subcontratación:** un profesional puede contratar a otro con `counterpartyUserId`
   (`projects/route.ts:198-205`) o con el mismo asistente Contratar (`professionalProfileId`):
   en los dos casos el cliente del proyecto nuevo es el profesional que subcontrata.
4. **Contratar a partir de algo ya publicado (D16, 24/09/2026)** — `POST /api/projects` acepta
   **uno** de estos dos campos (los dos juntos → 400):
   - `jobId` — un trabajo publicado del usuario de la sesión. Reglas: el trabajo existe (si no,
     404), es suyo (si no, **403** "Ese trabajo no es tuyo") y está `abierto` (si no, **409** "Ese
     trabajo ya no está abierto"). En **una transacción**: re-chequea que siga abierto, crea el
     proyecto con `jobId` (y `lat/lng` del trabajo), y cierra el trabajo con `closeJobWithHire`
     (§2). Si el profesional contratado tenía una oferta pendiente en ese trabajo, esa oferta queda
     `aceptado`, es el `selectedBidId` y la mano de obra del proyecto es su monto; si no, el
     proyecto arranca sin cotizar (`laborCost = 0`) y `selectedBidId` queda vacío. El resto de las
     ofertas pendientes pasan a `rechazado` con aviso. El brief (título, detalles, urgencia,
     presupuesto, dirección, fotos) es el que confirma el cliente en el asistente (precargado desde
     el trabajo y editable).
   - `parentProjectId` — un proyecto del **profesional de la sesión** (él es el profesional a
     cargo) que esté `activo` y no `finalizado`. Si no existe → 404; si no es suyo (o quien pide no
     tiene perfil profesional) → **403**; si está cancelado/finalizado → **409**. El proyecto nuevo
     queda con `parentProjectId` (autorrelación `Project.parent`/`subcontracts`, `onDelete:
     SetNull`). **Visibilidad:** el detalle del proyecto original trae `subcontracts` solo para su
     profesional a cargo; el detalle de la subcontratación trae `parentProject` solo si quien mira
     es su cliente **y** el profesional a cargo del original. El cliente original no puede abrir la
     subcontratación (403, no es parte) ni ve sus datos o montos en su proyecto; el subcontratado no
     ve el proyecto original.
   - Sin ninguno de los dos: igual que antes.
   - Avisos al contratado: con trabajo → "Te contrataron: cotizá la mano de obra para arrancar"
     con "…para su trabajo publicado "<título>"" (o "¡Te contrataron por tu oferta!" si había
     ofertado); con proyecto → "… te subcontrató: <título> (parte de su proyecto "<título>")".
   - Selector del asistente: `GET /api/projects/hire-sources` (§13).

### 3.2 Estados y etapas

- `status`: `activo` | `finalizado` | `cancelado`.
- `stage`: `presupuesto` → `materiales` → `ejecucion` → `revision` → `finalizado`
  (`projects/[id]/route.ts:8`). **Solo avanza, nunca retrocede.**
- Nada cambia si el proyecto no está `activo` (409 — `projects/[id]/route.ts:175-177`).

| Cambio | Quién | Condición | Efecto | Fuente |
|---|---|---|---|---|
| Cotizar mano de obra (`laborCost`) | Profesional del proyecto | Solo en `presupuesto`; > 0 | Notifica "Te cotizaron la mano de obra" | `projects/[id]/route.ts:246-256` |
| Avanzar de etapa | Cliente o profesional | Hacia adelante; salir de `presupuesto` exige mano de obra > 0 | Notifica "Proyecto → <Etapa>" a la otra parte | `:279-306` |
| Pasar a `finalizado` | **Solo el cliente** | Desde `ejecucion` o `revision` | `status = finalizado`; notifica "Proyecto finalizado"; habilita reseñas | `:283-299` |
| Cancelar (`status = cancelado`) | Cliente o profesional | Solo en `presupuesto` o `materiales`; motivo ≥ 3 caracteres; sin otros cambios en el mismo pedido | Libera el stock reservado de materiales aprobados; notifica; deja el motivo en el chat si existe | `:184-235` |
| Cambiar modo de materiales | Cliente o profesional (la UI lo muestra solo al profesional) | No puede haber facturas ni cobros emitidos | Notifica "Modo de pago de materiales actualizado" | `:259-276` |

### 3.3 Modos de pago de materiales (A/B)

`materialsPaymentMode` (`schema.prisma:291-295`), por defecto `pro_adelanta`:

- **Modo A — `pro_adelanta`:** el profesional compra los materiales y los cobra en **su factura**
  junto con la mano de obra (`projects/[id]/invoice/route.ts:71-75`).
- **Modo B — `cliente_paga_proveedor`:** el cliente paga los materiales **directamente al
  proveedor** mediante un cobro del proveedor (`ProviderCharge`, §5); la factura del profesional
  cubre **solo mano de obra** (`invoice/route.ts:74-75`).

### 3.4 Materiales del proyecto (`ProjectMaterial`)

Estados: `propuesto` → `aprobado` | `rechazado` | `reemplazado` (+ borrado físico)
(`projects/[id]/materials/route.ts:7-13`).

| Transición | Quién | Condición | Efecto | Fuente |
|---|---|---|---|---|
| (alta) → `propuesto` | Profesional del proyecto | Proyecto activo; cantidad y precio > 0; si elige proveedor: tiene que haber elemento del catálogo, **cuenta de retiro activa** con ese proveedor y stock suficiente. **No reserva stock** | Notifica "Nuevos materiales por aprobar" | `materials/route.ts:85-148`, `:25-43` |
| `propuesto` → `aprobado` | Cliente | Si tiene proveedor: **reserva atómica** (descuenta `quantity` solo si alcanza) | Recalcula `materialsCost`; notifica "Material aprobado"; si no alcanza el stock: 409 "pedile una alternativa" | `:193-233` |
| `propuesto`/`aprobado` → `rechazado` | Cliente | Si estaba aprobado, no puede estar facturado; libera el stock | Notifica con el motivo | `:236-269` |
| `propuesto` → (borrado) | Profesional | Solo si el cliente no decidió | — | `:272-277` |
| `propuesto`/`rechazado`/`aprobado` → `reemplazado` + alternativa nueva `propuesto` | Profesional | Si estaba aprobado, no facturado; libera stock; la alternativa vuelve a validar cuenta de retiro y stock | Notifica "Alternativa de material sugerida" | `:280-335` |

El IDOR está cerrado: el material tiene que pertenecer al proyecto de la URL (`:185-187`).

### 3.5 Facturas (`Invoice`)

- **Quién:** solo el profesional del proyecto; proyecto `activo` o `finalizado`
  (`invoice/route.ts:61-64`).
- **Una sola factura `pendiente` a la vez** por proyecto (`:65-67`); máximo 99 facturas (`:68`).
- **Contenido** (armado por el servidor, sin campos del usuario):
  - Modo A: materiales `aprobado` todavía no facturados + mano de obra.
  - Modo B: solo mano de obra.
  - La **mano de obra se factura una sola vez** (si ninguna factura anterior la incluyó) (`:77-78`).
  - Los materiales facturados quedan con `invoicedAt` en la misma transacción (`:136-141`).
- **Número** `HOM-<año>-<000001>` = cantidad de facturas + 1, con reintento ante choque (`:114-153`).
- Notifica "Nueva factura" al cliente (`:155-163`).
- Estados: `pendiente` → `pagada` (el estado `vencida` existe en el esquema y en el PDF pero **ningún
  código lo asigna** — búsqueda en `src/app/api`).

**Pago de una factura:**

| Vía | Quién inicia | Cómo se confirma | Fuente |
|---|---|---|---|
| Mercado Pago | Cliente (`POST /api/invoices/[id]`): preferencia con el **token del profesional** + cargo de servicio 1% (§6); sin MP conectado → 503 `needsConfig`, solo efectivo | Webhook: pago `approved`, ARS, monto = total + cargo ±1 → `pagada` + `Payment` + notificación "Factura pagada" al profesional (lleva al proyecto) | `invoices/[id]/route.ts`; `payments/webhook/route.ts` |
| Efectivo (sin cargo) | Cliente "acuerda" (`action: acordar`) → `Payment` `efectivo/acordado`, `serviceFee = 0` | Profesional "confirma" → `Payment` `confirmado`, factura `pagada` | `invoices/[id]/cash/route.ts:38-82` |
| Cancelar efectivo | Cliente, si no fue confirmado | Borra el acuerdo; la factura sigue pendiente | `cash/route.ts:84-101` |

Si el cliente había acordado efectivo y después paga por MP, el acuerdo de efectivo se borra **recién
cuando MP creó la preferencia** (`invoices/[id]/route.ts:67-72`).

**Cobros del profesional (`GET /api/invoices?mine=1`, 24/09/2026):** lista las facturas de TODOS los
proyectos del profesional de la sesión (el dueño sale de la sesión; `professionalId` = su
`ProfessionalProfile`), hasta 500, de la más nueva a la más vieja. Filtro opcional
`estado=pendientes|cobradas|todas` (zod; otro valor → 400; sin `mine=1` → 400; sin perfil
profesional → 403 `needsRole`). Por factura: número, fechas de emisión y cobro, estado, método,
mano de obra, materiales, total, `serviceFee` (solo si se pagó por MP: el 1% que pagó el cliente
aparte), `efectivoAcordado` (hay un `Payment` efectivo `acordado` y la factura no está pagada),
proyecto (id y título) y **solo el nombre** del cliente. Resumen: `cobradoMes` = suma de `total` de
las pagadas con `paidAt` desde el día 1 del mes en hora argentina (UTC−3); `pendienteTotal` y
`pendientesCount` = facturas no pagadas; `efectivoPorConfirmar`. No devuelve tokens, email ni ids de
Mercado Pago. Confirmar el efectivo desde Cobros usa el mismo `POST /api/invoices/[id]/cash
{action:'confirmar'}` (mismas reglas).

### 3.6 Fechas del trabajo y calendario del profesional (D21, 24/09/2026)

Campos en `Project` (migración `0031`): `startDate`, `endDate` (fin estimado), `scheduleStatus`
(`null` = sin fechas | `propuesta` | `acordada`), `scheduleProposedBy` (`profesional`|`cliente`),
`scheduleNote`, `scheduleUpdatedAt`, `prevStartDate`/`prevEndDate`. Máquina de estados pura en
`src/lib/schedule.ts` (`scheduleTransition`, con tests en `src/lib/__tests__/schedule.test.ts`);
endpoint `POST /api/projects/[id]/schedule`.

**Cuándo se pueden acordar fechas** (`scheduleBlockReason`): proyecto `activo`, etapa distinta de
`finalizado`, mano de obra cotizada (> 0) **y presupuesto aprobado**. En HomIA no existe un botón de
"aceptar la cotización": se toma como aprobado cuando (a) el proyecto nació de una oferta que el
cliente **aceptó** en la bolsa (o del asistente con la oferta previa de ese profesional, D16:
`JobPost.selectedBidId` → `JobBid` de este profesional en `aceptado`), o (b) el proyecto **ya salió
de `presupuesto`** (materiales/ejecución/revisión). Antes → 409 con el motivo (la tarjeta lo muestra).
Proyecto cancelado o finalizado → 409 para toda acción.

| Estado actual | Acción | Quién | Resultado |
|---|---|---|---|
| sin fechas | `proponer` | **solo el profesional** (el cliente → 409 "Las fechas las propone primero el profesional") | `propuesta` por profesional |
| `propuesta` por X | `proponer` | X | cambia su propia propuesta (sigue `propuesta` por X) |
| `propuesta` por X | `proponer` | el otro | contrapropuesta: `propuesta` por el otro |
| `propuesta` por X | `aceptar` | el otro (X → 409) | `acordada`; se borran `prev*` |
| `propuesta` por X (sin `prev*`) | `rechazar` (motivo opcional) | el otro (X → 409) | sin fechas; `scheduleProposedBy` = quién rechazó, `scheduleNote` = motivo; el profesional vuelve a proponer |
| `acordada` | `proponer` | cualquiera | **reprogramación**: `propuesta` por quien pide, `prev*` = lo acordado (sigue vigente) |
| `propuesta` con `prev*` | `rechazar` | el otro | vuelve a `acordada` con las fechas `prev*` (no se pierde lo acordado) |
| `acordada` o sin fechas | `aceptar`/`rechazar` | — | 409 "no hay ninguna propuesta pendiente" |

- **Validación:** días `AAAA-MM-DD` reales (zod + `isDayKey`: 30/02 → 400); fin ≥ inicio (400);
  inicio ≥ hoy en hora argentina (400); duración ≤ 365 días; inicio a ≤ 730 días.
- **Permisos:** 401 sin sesión; 403 si no sos el cliente ni el profesional del proyecto; 404 si no
  existe. El rol sale de la sesión, nunca del body.
- **Carreras:** el `update` es condicional sobre `scheduleStatus` y `scheduleUpdatedAt` leídos
  (concurrencia optimista): si otro pedido cambió las fechas en el medio → 409 "Las fechas cambiaron
  mientras tanto". Dos "Aceptar" simultáneos: uno 200 y el otro 409 (probado en E2E Q).
- **Avisos** en cada acción, a la otra parte: `Notification` con link al proyecto (tipos
  `fechas_propuestas`, `fechas_reprogramacion`, `fechas_acordadas`, `fechas_rechazadas`; los dos
  primeros además por mail vía `src/lib/notify.ts`), un mensaje en el chat cliente↔profesional si
  existe ("Fechas del trabajo: …", enviado por quien actuó) y un `ActivityEvent` del proyecto.
- **Solapamiento (avisa, no bloquea):** al proponer, el servidor busca otros proyectos `activo` del
  mismo profesional con fechas `acordada` o `propuesta` (incluidas las `prev*` de una reprogramación)
  que se toquen con el rango (días inclusive). Devuelve `solapamiento.cantidad`; **solo al
  profesional** le agrega `proyectos` (id, título, rango, estado). Al cliente nunca le llegan títulos
  de otros proyectos. La UI del profesional también avisa en vivo mientras elige las fechas.
- **Ocupación de un profesional** (`busyRangesOf`): `acordada` → rango "ocupado"; `propuesta` →
  rango "por confirmar" y, si es una reprogramación, además las `prev*` como "ocupado". Solo
  proyectos `activo` (los cancelados o finalizados no ocupan).
- **Próxima fecha libre:** primer día desde hoy que no cae en ningún rango ocupado **ni** por
  confirmar (criterio conservador: no promete un día que puede quedar tomado). **Disponible esta
  semana:** hay algún día libre entre hoy y el domingo.
- **Privacidad de la disponibilidad pública** (`GET /profiles/professional/[id]/availability`, sin
  sesión): solo rangos de días **unidos** por estado (no deja contar proyectos) con `estado`
  `ocupado`|`por_confirmar`, `proximaFechaLibre` y `disponibleEstaSemana`. Nunca título, cliente,
  dirección, nota ni ids de proyectos. Ventana por defecto hoy → +91 días, máximo 186 (≈ 6 meses),
  no antes del mes en curso. Cuentas eliminadas o demo con `HIDE_DEMO_USERS=1` → 404
  (`src/lib/visibility.ts`, D20).
- **Calendario del profesional** (`GET /professional/calendar?from&to`, solo el propio profesional,
  sale de la sesión): sus proyectos `activo`/`finalizado` con fechas que tocan la ventana (título,
  cliente, etapa, estado y rangos), `sinFecha` = activos con presupuesto aprobado y sin fechas (con
  quién rechazó y el motivo si corresponde) y `pendientes` = propuestas del cliente que esperan su
  respuesta. Ventana por defecto: el mes en curso; máximo 190 días.
- **Homy:** `buscar_profesionales` devuelve `proxima_fecha_libre` y `disponible_esta_semana` de cada
  profesional (una sola consulta para todos, `nextFreeForPros`); la nota de la herramienta le dice que
  la disponibilidad es orientativa y que no diga nada si viene `null`.

---

## 4. Carrito, pedidos y compras de materiales

Desde el commit `2eed864` las compras de materiales van por **carrito y pedidos multiproveedor**.
Un **pedido** (`Order`, número `PED-AAAA-NNNNNN`) se parte en **sub-pedidos** (`Purchase`) **por
proveedor y por tipo**, con sus productos (`PurchaseItem`). Cada sub-pedido sigue su propia máquina
de estados y se paga por separado. Las compras de un solo producto hechas antes quedan como "Compra
anterior".

**D15 (24/09/2026, Leonardo):** *"Las compras no necesitan aprobación del proveedor: son directas al
pago, siempre y cuando haya stock. Las aprobaciones son para las reservas de productos, con o sin
stock."* Reglas y plazos en `src/lib/order-rules.ts`:

| Tipo | Cuándo | Nace en | Plazo |
|---|---|---|---|
| **Compra** (`type = compra`) | Solo si hay stock suficiente de **todos** sus ítems | `aprobado` (= "Por pagar"): stock reservado + `ProviderCharge` emitido, **sin** intervención del proveedor | **24 h** para pagar por MP o elegir efectivo; con efectivo acordado, **7 días desde la compra** (`approvedAt`) para retirar y pagar |
| **Reserva** (`type = reserva`) | Con o sin stock | `pendiente_aprobacion` (no toca el stock) | La aprueba el proveedor: con stock → reserva + cobro + **48 h**; sin stock → `esperando_stock` con fecha aproximada (`availableFrom`), y al marcarla **disponible** → reserva + cobro + **48 h** |

Se reusa el estado `aprobado` para "por pagar" (compra) porque significa exactamente lo mismo que
una reserva aprobada: stock reservado y cobro emitido. Así el pago, la entrega, la cancelación y el
cron siguen una sola lógica; la UI lo nombra "Por pagar" en las compras.

### 4.1 Carrito

- **Quién:** clientes y profesionales (`canBuy`: rol `cliente` o `profesional`,
  `src/lib/cart-server.ts:135-137`); **visitantes también**, en su navegador. Un proveedor sin rol
  cliente ve "El carrito es para clientes y profesionales" (en la práctica todo registro tiene rol
  cliente, §1).
- **Visitante:** el carrito vive en `localStorage` (`homia_cart_v1`, `src/lib/cart.ts:50`);
  `POST /api/cart/preview` le devuelve precios, stock y problemas actuales. Al ingresar o crear
  cuenta, `POST /api/cart/merge` lo **fusiona** con el de la cuenta: suma cantidades, recorta al
  stock disponible y al paso de la unidad, y descarta ofertas inexistentes o propias
  (`cart/merge/route.ts:28-55`). El registro y el ingreso respetan `?volver=/carrito`
  (`auth-register.tsx`).
- **Cuenta:** el carrito está en la base (`CartItem`, `GET/POST/PATCH/DELETE /api/cart`). Máximo
  **60 productos** (`cart/route.ts:18`). Al agregar se valida: la oferta existe, no es propia, el
  proveedor opera y la cantidad respeta el paso de la unidad (**de a 1** por pieza, **de a 0,5** en
  metro, m2, m3, kg y litro — `src/lib/units.ts`). **Desde D15 se puede agregar sin stock o más de lo
  que hay**: esa línea queda `inStock: false` y solo se puede reservar.
- **"Comprar" / "Reservar" en las ofertas:** la elección del botón se recuerda en el navegador
  (`homia_cart_modes_v1`, `src/lib/cart.ts`) solo como valor inicial del paso de confirmación.
- **Vista:** agrupado por proveedor con subtotal, "Cargo de servicio HomIA (1%) — solo si pagás con
  Mercado Pago" y "Total con Mercado Pago"; cada línea marca su problema (no existe, proveedor
  inactivo, propio) y **no se puede confirmar** mientras haya alguno (`cart-server.ts`). Sin stock o
  stock insuficiente **no es un problema**: la línea trae `stockNote` ("Sin stock: podés reservarlo y
  el proveedor te avisa" / "Hay N … para comprar ya: para más, reservalo"). Vaciar pide confirmación.

### 4.2 Confirmar el pedido

`POST /api/orders` (`orders/route.ts`): exige sesión y rol que compra; zod: `lineTypes` (por
`stockId`: `compra` | `reserva`), `types` (por proveedor, compatibilidad) y `note` (≤ 500). El tipo de
cada línea: `lineTypes[stockId]` → `types[providerId]` → **compra si hay stock, reserva si no**.
`validateLines` (`src/lib/orders.ts`) re-valida todo: oferta existente, proveedor operando, no propio,
paso de la unidad, y **una línea pedida como compra sin stock suficiente es un problema** ("No hay
stock para comprarlo ahora: podés reservarlo…" / "Solo quedan N …"): 409 con el primer problema, sin
crear nada. `createOrder` crea en **una transacción** el `Order` y un `Purchase` **por proveedor y por
tipo** (si un proveedor tiene de los dos, dos sub-pedidos):

- **compra:** `status = aprobado`, `approvedAt = ahora`, `reservationExpiresAt = ahora + 24 h`;
  **reserva atómica** de todos sus ítems (`reserveItems`: `updateMany` condicional `quantity >= pedido`
  + movimiento `reserva` + estado del stock) y **`ProviderCharge` `pendiente`** con número
  `PRV-AAAA-NNNNNN`, todo dentro de la misma transacción. Si un ítem no alcanza (el stock cambió entre
  la validación y la transacción) se deshace **todo el pedido** y responde 409 "…solo quedan N … No se
  creó nada: bajá la cantidad o reservalo".
- **reserva:** `status = pendiente_aprobacion`, sin tocar el stock ni emitir cobro.

Después, a cada proveedor: mensaje en el chat **iniciado por el cliente** con el detalle (los ítems
sin stock dicen "sin stock: pido que me lo consigas"), notificación ("**Nueva compra: stock
reservado**" … "Preparalo" / "**Nueva reserva de un cliente**" … "Aprobala o rechazala en Ventas",
avisando si incluye productos sin stock) y eventos `pedido_creado` + `compra_confirmada` /
`subpedido_creado` en la línea de tiempo. Del carrito se borra solo lo que se pidió.

`POST /api/purchases` (pedido de un solo producto, compatibilidad) usa el mismo `createOrder` con
`source: 'directo'`; `type` es opcional (sin tipo: compra si hay stock, reserva si no).

### 4.3 Máquina de estados del sub-pedido (`purchases/[id]/route.ts`)

Estados: `pendiente_aprobacion` (reserva sin aprobar) · `esperando_stock` (reserva aprobada sin
stock, **nuevo en D15**) · `aprobado` ("Por pagar": stock reservado + cobro) · `entregado` ·
`pagado` · `rechazado` · `cancelado`.

| Transición | Quién | Condición | Efecto |
|---|---|---|---|
| (alta) → `aprobado` | Sistema, al confirmar una **compra** | Stock suficiente de todos los ítems | Reserva atómica + cobro + 24 h (§4.2) |
| `pendiente_aprobacion` → `aprobado` | Proveedor con plan activo | **Reserva** con stock de todos los ítems (o compra anterior a D15 que quedó pendiente). Con un solo ítem puede ajustar/fijar el precio (`unitPrice`) | Reserva atómica de TODOS los ítems + `ProviderCharge` `pendiente` + 48 h (reserva; 7 días para una compra histórica); notifica "Tu reserva fue aprobada"; evento `aprobado` |
| `pendiente_aprobacion` → `esperando_stock` | Proveedor con plan activo | Reserva donde algún ítem no alcanza **y** manda `availableFrom` (AAAA-MM-DD, entre hoy y 6 meses; se guarda a las 12:00 de Argentina). Sin fecha → 409 `needsDate` que dice cuál; fecha inválida → 400 | Guarda `availableFrom`, `approvedAt` y el precio ajustado; **no descuenta stock ni emite cobro**; notifica `reserva_aprobada_sin_stock` ("lo tendría disponible aproximadamente el …"); evento `aprobado_sin_stock` |
| Aprobar una **compra** | Proveedor | — | 409 "Las compras no se aprueban: el cliente ya la tiene lista para pagar" |
| `esperando_stock` → `aprobado` (`action: disponible`) | Proveedor con plan activo | Stock suficiente de todos los ítems; si no, 409 "Todavía no te alcanza el stock de …" | Reserva atómica + cobro + 48 h; notifica `reserva_disponible` ("Tu reserva ya está para retirar"); evento `disponible` |
| `pendiente_aprobacion` → `rechazado` | Proveedor | Solo reservas pendientes; motivo opcional | Notifica "Tu reserva fue rechazada"; evento `rechazado` |
| → `cancelado` (cliente) | Cliente | Desde `pendiente_aprobacion`, `esperando_stock` o `aprobado` con cobro no pagado; `updateMany` condicional | Si el stock estaba reservado (`aprobado`) libera **todos** los ítems; cobro `anulada` |
| → `cancelado` (proveedor) | Proveedor | **Motivo obligatorio** (≥ 3 letras; si no, 400 `needsReason`). Desde `pendiente_aprobacion`, `esperando_stock`, `aprobado` o `pagado` **no entregado** (sin movimiento `consumo`; si ya entregó → 409) | Libera el stock reservado. Si estaba **pagado por MP**: primero **reembolso total** con `refundPayment` y el **token OAuth del proveedor** (idempotencia `purchase-cancel-<id>`); sin MP conectado → 409 `needsMp`; si MP falla → 502 y **no se cancela nada**; si sale, `Payment.refundedAmount` = monto y cobro `reembolsada`. Si estaba **pagado en efectivo**: cobro `reembolsada` y el aviso dice que lo devuelve en mano. Notifica al cliente con el motivo; evento `cancelado` |
| Pagar en efectivo | Cliente | Desde `aprobado` o `entregado`, con cobro emitido | Cobro `acordada_efectivo`, `serviceFee = 0`; en una **compra** `aprobado`: `reservationExpiresAt = approvedAt + 7 días` |
| Pagar por MP | Cliente | Desde `aprobado` o `entregado`; proveedor con MP conectado | Preferencia con el **token del proveedor**, cargo = 1% del subtotal del sub-pedido; sin conexión: 503 `needsConfig` "‹Proveedor› todavía no conectó Mercado Pago: podés pagar en efectivo". Desde `pendiente_aprobacion`/`esperando_stock` → 409 |
| → `entregado` / `pagado` | Proveedor | Desde `aprobado` o `pagado` no entregado | Movimiento `consumo` por ítem; nunca retrocede desde pagado |
| → `pagado` | Webhook (MP) o proveedor al confirmar efectivo | — | Cobro `pagada`; habilita la reseña de la compra |
| Pago MP que llega con el sub-pedido `cancelado`/`rechazado` | Webhook | Pago aprobado y monto válido | **No** se reabre: reembolso total con el token del proveedor (idempotencia `purchase-late-<paymentId>`), avisa a los dos (`compra_pago_devuelto`), evento `pago_devuelto`; si el reembolso falla, avisa que el proveedor tiene que reintegrarlo (evento `pago_tardio`) |
| `aprobado` → `cancelado` por vencimiento | Cron horario | `reservationExpiresAt` vencido y cobro no pagado | Libera todos los ítems, anula el cobro, avisa a ambos, evento `vencido` con el motivo: "Compra vencida (24 h sin pagar ni elegir efectivo)", "Plazo de retiro vencido (7 días con efectivo acordado)" o "Reserva vencida (48 h sin pagar ni retirar)". `esperando_stock` no vence |

Todas las acciones del proveedor exigen plan activo. Cada acción queda en `ActivityEvent`.

### 4.4 Seguimiento del pedido ("Mis pedidos")

`GET /api/orders` y `GET /api/orders/[id]` (dueño; 404/403) devuelven cada pedido con su resumen
(`src/lib/order-view.ts`): partes activas (no rechazadas/canceladas), cuántas pagaron,
**monto pendiente** y estado `esperando` (todas en `pendiente_aprobacion` o `esperando_stock`) |
`en_curso` | `completo` | `cerrado` (ninguna activa). Cada parte trae `availableFrom`. El proveedor ve **solo su parte** del pedido, con su línea de
tiempo, en Cobros → Ventas.

---

## 5. Cobros del proveedor (`ProviderCharge`)

Nacen en tres casos: (1) al **confirmar una compra** del carrito (§4.2, en la misma transacción),
(2) al **aprobar una reserva con stock o marcarla disponible** (§4.3) y (3) cuando el proveedor
**emite un cobro por los materiales aprobados** de un proyecto en **modo B**.

- **Emitir cobro de proyecto** (`POST /api/provider/charges`, `provider/charges/route.ts:84-157`):
  proveedor con plan activo; proyecto en modo B; no al propio usuario; **un solo cobro abierto
  (`pendiente` o `acordada_efectivo`) por proyecto**; incluye los materiales aprobados de ese
  proveedor que no estén en cobros anteriores (`materialIds`, evita doble cobro); número
  `PRV-<año>-<000001>` con reintento (`src/lib/charge-number.ts`). Notifica "Cobro de materiales del
  proveedor".
- **Estados:** `pendiente` → `acordada_efectivo` → `pagada`; `pendiente` → `pagada` (MP); cualquier
  no pagado → `anulada` (cancelación o vencimiento del sub-pedido); `pagada` → `reembolsada` (el
  proveedor cancela una venta ya pagada y no entregada, D15).

| Transición | Quién | Fuente |
|---|---|---|
| `pendiente` → `acordada_efectivo` | Cliente (`POST /api/charges/[id]` `method: efectivo`), sin cargo | `charges/[id]/route.ts` |
| `pendiente` → preferencia MP | Cliente (`method: mercadopago`), con el **token del proveedor** + cargo 1%; sin conexión 503 `needsConfig` | `charges/[id]/route.ts` |
| → `pagada` por MP | Webhook | `payments/webhook/route.ts` |
| `acordada_efectivo` → `pagada` | Proveedor dueño (`PATCH /api/charges/[id]`) | `charges/[id]/route.ts` |

No existe un cobro "libre" ni un link de pago que el proveedor pueda compartir.

---

## 6. Montos, cargo de servicio y a dónde va la plata

Decisión del 24/09/2026 (Leonardo), implementada en `2eed864`:

| Pago | Quién cobra (cuenta MP) | Cargo de servicio HomIA (1%) | Fuente |
|---|---|---|---|
| Sub-pedido de materiales por MP | **Proveedor** (su OAuth) | Lo paga el cliente: 1% del subtotal **de ese proveedor**, sumado | `purchases/[id]/route.ts:150-177` |
| Factura de proyecto por MP | **Profesional** (su OAuth) | Lo paga el cliente: 1% del total de la factura | `invoices/[id]/route.ts` |
| Cobro de materiales (modo B) por MP | **Proveedor** (su OAuth) | Lo paga el cliente: 1% del cobro | `charges/[id]/route.ts` |
| Cualquiera en efectivo | En mano | **Sin cargo** (`serviceFee = 0`) | `invoices/[id]/cash`, `charges/[id]`, `purchases/[id]` |

Reglas:

- **Cálculo:** `serviceFeeFor(subtotal) = round2(subtotal × 0,01)`; total con MP =
  subtotal + cargo (`src/lib/fees.ts`). Se calcula **por proveedor** (por sub-pedido), no sobre el
  total del pedido.
- **El vendedor cobra el 100%** de su precio en su propia cuenta: el cargo va a HomIA como
  `marketplace_fee` de la preferencia creada con el token del vendedor.
- **Vendedor sin Mercado Pago conectado → solo efectivo:** 503 `{ needsConfig: true }` con el
  mensaje "‹Nombre› todavía no conectó Mercado Pago: podés pagar en efectivo" (`src/lib/seller-pay.ts`).
- El cargo cobrado se guarda en `serviceFee` (se fija al crear la preferencia y el webhook lo
  confirma como `pagado − subtotal`); **no suma** a `total`/`amount`.
- **El cargo no se reembolsa** en devoluciones de sobrantes (§12.2).
- Textos de la app: la ayuda dice "Solo cuando pagás con Mercado Pago (una factura, un cobro de
  materiales o una compra) se suma un «Cargo de servicio HomIA (1%)» que paga quien compra; el
  profesional o el proveedor cobra el 100% de su precio. En efectivo no hay cargo."
  (`src/components/screens/help-screen.tsx`).
- **Pagos anteriores al cambio:** los de facturas y cobros se cobraron con la cuenta de HomIA
  (`Payment.collector = null`/`plataforma`) y las compras con 1% descontado al proveedor; el
  webhook y los reembolsos los siguen manejando con la regla histórica.

---

## 7. Stock y reservas

- `ProviderStock.status` se **deriva** de la cantidad: `agotado` si ≤ 0, `por_agotar` si ≤
  `minStock` (default 5), si no `disponible` (`provider/stock/route.ts:36-43`).
- **Movimientos** (`StockMovement.type`): `entrada` (alta o suba manual), `salida`/`ajuste`
  (edición manual), `reserva` (aprobación de material, confirmación de una compra, aprobación o
  "disponible" de una reserva), `liberacion` (rechazo, reemplazo, cancelación, vencimiento), `consumo` (entrega de compra), `devolucion` (sobrantes recibidos).
- **Reserva = descuento real de `quantity`** con `updateMany` condicional (`quantity >= pedido`):
  si no alcanza no se toca nada (`materials/route.ts:199-204`; `purchases/[id]/route.ts:174-178`).
  El modelo `StockReservation` **no se usa**.
- Un material de proyecto **no se descuenta al entregarse ni al facturarse**: la reserva al aprobar
  es el descuento definitivo (no hay movimiento `consumo` para proyectos — búsqueda en
  `projects/[id]/*`).
- Un proveedor publica **una sola entrada por elemento** del catálogo (`@@unique([providerId,
  elementId])`; 409 "Ya tenés ese elemento" — `provider/stock/route.ts:113-116`).
- Con plan vencido no puede crear, editar ni borrar stock (`provider/stock/route.ts:101-104`).
- Catálogo maestro: 20 categorías y el catálogo de elementos; alta de elementos nuevos solo por
  proveedores, con anti-duplicado difuso (nombre o alias igual o contenido, sin acentos) y texto de
  IA (`catalog/route.ts:61-143`).

---

## 8. Planes del proveedor (suscripción)

Único rol que paga (`src/lib/plans.ts:1-11`). Clientes y profesionales usan HomIA gratis; la
suscripción PRO del profesional quedó como **legado** y responde 403 "HomIA es gratis para
profesionales" (`pro/subscription/route.ts`).

| Plan | Precio | Qué da | Fuente |
|---|---|---|---|
| `trial` (prueba) | Gratis 14 días desde el alta | Todo lo del Básico | `plans.ts:15`, `auth/register/route.ts:126-127` |
| `basic` | $50.000/mes (ARS, env `MP_PROVIDER_BASIC_ARS`) | Usar la app: stock, ventas directas, cobros MP y efectivo, CRM, vinculaciones | `plans.ts:19-27` |
| `pro` | $100.000/mes (env `MP_PROVIDER_PRO_ARS`) | Básico + **logo y marca en la cinta de sponsors de la home**, **"Recomendado" y primero** en directorio, marketplace, búsquedas, mapa y comparables (en Homy el PRO solo **desempata**: el orden lo decide verificado > reseñas > precio > distancia), y **analítica de demanda** | `plans.ts:4-11`, `:28-30` |

**Reglas:**

- `puedeOperar()` = plan pago o prueba vigente (`plans.ts:74-76`). Si no puede operar:
  desaparece de marketplace, búsqueda, mapa, directorio, comparables y agente
  (`marketplace/route.ts:53,116`; `search/route.ts:38`; `search/pins/route.ts:58`;
  `directory/route.ts:134`; `comparables/route.ts:29`; `src/lib/homy/datos.ts:140`); no puede
  recibir pedidos ("El proveedor no está operando por ahora" — `src/lib/orders.ts:121`), ni
  gestionar stock, pedidos, cobros o analítica.
- `esProActivo()` = `subscription === 'pro'` **y** puede operar: **única fuente de verdad** de todo
  beneficio PRO (`plans.ts:82-90`). La marca en la home solo se puede editar con PRO activo (403
  `needsPro` — `profiles/me/route.ts:125-137`).
- **Analítica PRO** (`GET /api/provider/analytics`, `provider/analytics/route.ts`): últimos N días
  (1–365, default 30): top 8 elementos más pedidos (ítems de pedidos del carrito + compras históricas + materiales aprobados en obras),
  consultas del rubro (búsquedas que mencionan sus elementos o categorías), búsquedas en las que
  apareció, y resumen de ventas. Básico y prueba reciben 403 `needsPro`.
- **Cinta de sponsors** (`GET /api/sponsors`): proveedores con PRO activo, primero los que cargaron
  logo propio, después por rating y reseñas; máximo 40; sin logo se usa la foto de perfil
  (`sponsors/route.ts:10-58`). En la home cada sponsor aparece **una vez por vuelta**: cada copia
  de la cinta mide al menos el ancho de la pantalla más un logo (`sponsors.tsx`, `.homy-marquee-copy`).

**Transiciones de plan** (`planTransicion`, `plans.ts:115-190`, aplicada por webhook y cron):

| Evento | Resultado | Notificación |
|---|---|---|
| Suscribirse / cambiar plan | `POST /api/provider/plan` crea una preapproval nueva **sin cancelar la vigente** (`provider/plan/route.ts:50-74`) | — |
| MP avisa `authorized` de la nueva | Activa el plan, guarda `mpPreapprovalId`, `proSince` al subir a PRO; **recién ahí cancela la anterior** | "¡Subiste al plan PRO!", "Pasaste al plan Básico" o "Plan Básico activo" |
| MP avisa `cancelled`/`paused` de la **vigente** | Vuelve a `trial` con `trialEndsAt = 1970` (prueba consumida): no puede operar | "Tu plan se canceló" / "Tu suscripción quedó pausada" |
| Aviso de una suscripción que no es la vigente | Se ignora | — |
| Cron diario: `authorized` pero sin cobro hace más de **35 días** | Degrada por falta de pago | "Tu plan se canceló por falta de pago" |

- **Vencer la prueba** no dispara nada: `planState()` calcula en el momento que ya no está activa
  (`plans.ts:58-70`).
- **No hay botón para cancelar** la suscripción en la app: se cancela desde la cuenta de Mercado
  Pago (texto de `src/components/screens/panel/proveedor/plan.tsx:263`).
- Al degradarse, se conservan datos, reseñas y vinculaciones.

---

## 9. Reseñas

Todas con **estrellas enteras 1–5 + comentario obligatorio (≤ 2000) + hasta 4 fotos** (solo del
bucket de HomIA y extensión de imagen) (`reviews/route.ts:9-44`). No se puede reseñar a uno mismo.

| Contexto | Autor | Destinatario | Cuándo | Unicidad | Fuente |
|---|---|---|---|---|---|
| `compra` | Comprador del sub-pedido | Proveedor de ese sub-pedido | Sub-pedido `entregado` o `pagado` | Una por sub-pedido (`purchaseId`) y autor | `reviews/route.ts:49-106` |
| `proyecto` | Cliente del proyecto | Profesional y **cada proveedor con materiales aprobados** | Proyecto finalizado | Una por proyecto + autor + destinatario | `:109-156` |
| `proyecto` | Profesional del proyecto | Cliente | Proyecto finalizado | Idem | `:130-133` |

- Toda reseña que no sea de compra **exige un proyecto real** (`:109-111`).
- Al publicar se recalcula el promedio y la cantidad en `User` y en los perfiles del destinatario
  (`:171-184`) y se notifica.
- El proveedor **no reseña** a nadie.
- El campo `reply` (respuesta a la reseña) existe y se muestra en el perfil del profesional, pero
  **no hay endpoint para escribirla** (no implementado — búsqueda de `reply` en `src/app/api`).
- La unicidad se controla en código, no hay índice único en la base (`schema.prisma:441-458`).

---

## 10. Mensajería

- Conversación 1–1 por par de usuarios, única en ambas direcciones (`userAId < userBId`)
  (`schema.prisma`, `Conversation`).
- **Regla "el cliente inicia", decidida por el destinatario** (decisión D13;
  `messages/conversations/route.ts`, `POST`): una conversación **nueva** solo se puede abrir hacia
  quien **ofrece algo** (tiene rol `profesional` o `proveedor`). A un usuario que **solo es cliente**
  nadie le escribe primero: responde 403 `clientesFirst` "En HomIA los clientes escriben primero:
  cuando te contacte, vas a poder responderle sin problema." Si el hilo ya existe, cualquiera
  responde. Se decide por el destinatario porque todo registro recibe rol cliente, así que mirar los
  roles de quien escribe no frenaba a nadie.
- Los perfiles públicos de profesionales y proveedores siempre se pueden contactar
  (`chatBlocked = false` en `profiles/professional/[id]` y `profiles/provider/[id]`).
- Los flujos que escriben por el cliente: cada sub-pedido abre el chat con el detalle
  (`src/lib/orders.ts:205-215`); el asistente Contratar con "mensaje inicial"
  (`projects/route.ts`); la cancelación de proyecto y el pedido de devolución escriben en el hilo
  **solo si ya existe**.
- Enviar: 1–4000 caracteres (zod); notifica "Nuevo mensaje de …"; abrir el hilo marca como leídos los
  mensajes del otro (`messages/conversations/[id]/route.ts`). Mensaje + fecha de la conversación +
  notificación se guardan juntos (una transacción).
- **Mensajes nuevos por cursor (24/09/2026):** `GET /messages/conversations/[id]?after=<fecha ISO>`
  devuelve solo los mensajes con fecha **>=** `after` (incluye el del borde; el cliente deduplica por
  id), también marca leídos, y trae `readUpTo` = fecha del último mensaje **mío** que el otro ya
  leyó (con eso se pinta el doble tilde celeste sin volver a pedir todo). `after` inválido → 400.
  Sin `after`: los últimos 300 mensajes en orden ascendente.
- **Bandeja:** hasta 200 conversaciones ordenadas por último mensaje, cada una con el último mensaje y
  sus no leídos (mensajes del otro sin `readAt`).
- **Pantalla:** el hilo abierto pide lo nuevo cada 3 s y la bandeja cada 10 s (solo si está a la
  vista y la pestaña no está oculta; nunca se apilan dos pedidos iguales). El envío es optimista: el
  mensaje aparece al instante y, si el servidor lo rechaza, se saca y el texto vuelve al campo.

---

## 11. Verificación de identidad (DNI) e IA

**DNI** (`verification/dni/route.ts`, `src/lib/dni-ai.ts`):

1. El usuario sube frente y dorso al bucket privado (paths propios obligatorios).
2. **Máximo 3 intentos por día** (`:16`, `:83-90`).
3. Se crea el documento `en_revision`; la IA de visión analiza las dos fotos.
4. Dictamen (`dni-ai.ts:11-13`): `verificado` exige documento válido + legible + mismo titular
   afirmado explícitamente; `rechazado` si no es documento o los titulares no coinciden;
   `en_revision` si es ilegible, confianza baja, o la IA no responde.
5. **Cruce con el perfil profesional:** si el número leído difiere del DNI/CUIL cargado, se rechaza
   con nota clara (`:107-120`).
6. Estado público: `verificado` y `rechazado` siempre se publican; `en_revision` solo si no estaba
   ya verificado (no se quita la insignia por una foto dudosa) (`:132-147`). Se notifica el
   resultado.
7. El estado se muestra **siempre** junto al nombre ("verificado", "En revisión", "No verificado").

**IA — súper agente Homy** (`src/app/api/homy/agent/route.ts`, `src/lib/homy/*`; detalle técnico en
`TECNICO-HOMIA.md` §6.3.1):

- **Abierto a visitantes con cupo:** 8 consultas por día por IP (compartidas entre el buscador y el
  botón flotante de la home) y 60 por día por usuario logueado; se renueva a la medianoche de
  Argentina. Tope global de todos los visitantes juntos: `HOMY_TOPE_DIARIO_VISITANTES` (3000).
- La consulta se **descuenta justo antes de llamar al modelo** y **se devuelve** si la IA falla.
  Con el cupo agotado no se llama al modelo: "Llegaste al límite de consultas de hoy sin cuenta:
  creá tu cuenta gratis y seguimos." (visitante) o "…Mañana se renueva…" (usuario).
- Modelo `gpt-5.6-luna` (Responses API), razonamiento `low`.
- **Solo lee** datos reales (materiales sugeridos del catálogo, proveedores con stock,
  profesionales, trabajos, cómo funciona HomIA y, con sesión, los pendientes del usuario); nunca
  escribe en tablas de negocio.
- El **orden** de resultados lo decide el código (verificado > reseñas > precio/obras > distancia;
  PRO desempata en proveedores), no el modelo.
- **Guardarraíles en código:** solo links de la app o devueltos por una herramienta, solo
  entidades que trajo una herramienta, solo montos leídos, "Verificado"/"Recomendado" solo si es
  cierto, sin frases prohibidas.
- **Kill-switch** `HOMY_APAGADO=1`: responde sin IA. Si la IA falla, **respaldo honesto** con las
  mismas búsquedas reales.
- La verificación de DNI mantiene su tope de 3 intentos por día.

---

## 12. Mercado Pago del vendedor, sobrantes, vinculaciones y crons

### 12.1 Conexión de Mercado Pago (OAuth)

- **Proveedor:** conecta desde Cobros; **profesional:** desde **Cobros** (`/panel/profesional/cobros`,
  desde el 24/09/2026; antes era Mi perfil), tarjeta "Cobrá con tu Mercado Pago"
  (`src/components/app/mp-connect-card.tsx`). La vuelta del OAuth del profesional (connect y callback)
  redirige a `/panel/profesional/cobros?mp=conectado|cancelado|error`. Ambos por
  `GET /api/mp/oauth/connect?kind=provider|professional` y desconectan con
  `DELETE /api/mp/oauth?kind=provider|professional`. Estados `connected` / `disconnected` /
  `expired`.
- **Sin conexión:** sus clientes solo pueden pagarles **en efectivo** (compras, cobros y facturas).

### 12.2 Sobrantes (`LeftoverReturn`)

Reglas (`src/lib/leftovers.ts`, `src/lib/leftovers-cron.ts`, `returns/*`).

**D14 (24/09/2026, Leonardo): "Devuelve la plata quien la cobró, y los materiales vuelven a quien se
los vendió al cliente."** Cada devolución tiene una **pata** (`tipo`) y un **vendedor**
(`sellerKind`), que es quien acepta, recibe y reembolsa:

| Pata (`tipo`) | Origen | Vendedor (`sellerKind`) | Stock | Reembolso |
|---|---|---|---|---|
| `cliente` | Compra directa (sub-pedido) | `proveedor` | Vuelve al stock del proveedor | MP con el token que cobró, o efectivo |
| `cliente` | Proyecto modo B (`cliente_paga_proveedor`, cobro del proveedor pagado) | `proveedor` | Vuelve al stock del proveedor | MP (token del proveedor) o efectivo |
| `cliente` | Proyecto modo A (`pro_adelanta`, factura del profesional pagada) | `profesional` (`professionalId`, `providerId = null`) | **No vuelve a ningún stock** | MP **desde la cuenta del profesional** (su OAuth; si falla → `reembolso_fallido` con reintento) o efectivo |
| `profesional_a_proveedor` (opcional) | Proyecto: materiales que el profesional le compró al proveedor | `proveedor` | Vuelve al stock del proveedor | **Por fuera de HomIA** (`reembolsar_fuera`): efectivo, transferencia o saldo a favor + nota. Nunca MP |

El vendedor se resuelve por el pago de origen (`materialPaidOrigin`): factura → profesional,
cobro o compra → proveedor (`sellerKindOf`). Las devoluciones anteriores a D14 quedaron
`tipo = cliente`, `sellerKind = proveedor` (sin migrar datos).

- **Quién pide (pata cliente):** el comprador de un sub-pedido `pagado` (por ítem: `purchaseItemId`),
  o el cliente de un proyecto, sobre materiales `aprobado` **con proveedor** y **ya pagados**. El
  **profesional** también pide como comprador en **modo B** (como antes); en modo A no puede (él es
  el vendedor: 409 "se lo cobraste al cliente en tu factura…") y `GET /returns/eligible` no le
  ofrece esos materiales.
- **Quién pide (pata profesional → proveedor):** solo el profesional del proyecto, sobre materiales
  `aprobado` con proveedor y elemento que **no** pagó el cliente con un cobro del proveedor, en un
  proyecto `pro_adelanta` (o ya facturados). Puede vincularla (`parentReturnId`) a una devolución de
  su cliente de ese mismo proyecto donde él es el vendedor (si no, 400); el diálogo precarga lo
  recibido (`prefill` de `/returns/eligible?tipo=profesional_a_proveedor`).
- **Plazo:** hasta **30 días** desde el pago. En la pata profesional → proveedor (sin pago en
  HomIA): 30 días desde que el material se facturó al cliente o, si todavía no, desde su última
  actualización (aprobación).
- **Un pedido = un solo vendedor y un solo pago de origen** (misma factura, cobro o compra). Con
  vendedor profesional, un pedido puede traer materiales de varios proveedores (todos de su factura);
  en la pata profesional → proveedor, un pedido = un proveedor.
- **Cantidades por pata:** cada pata lleva su propia cuenta (`alreadyReturnedQty(..., tipo)`). Pata
  cliente: ≤ lo comprado menos lo ya devuelto por el cliente. Pata profesional → proveedor: ≤ la
  cantidad del `ProjectMaterial` aprobado (lo que ese proveedor le vendió) menos lo ya pedido en
  devoluciones profesional → proveedor activas (409 si se pasa). Lo que el profesional le pide al
  proveedor no descuenta lo que el cliente puede devolver, ni al revés.
- Por ítem: cantidad ≤ lo comprado menos lo ya devuelto; estado `sin_abrir` / `abierto_sin_usar`;
  **foto obligatoria**; nota opcional.
- **Monto a reembolsar:** precio pagado de lo devuelto. **El cargo de servicio del 1% no se
  reembolsa**: el tope es lo pagado − cargo − lo ya reembolsado (`refundableOf`). Pata profesional →
  proveedor: tope por ítem = precio unitario del material × cantidad aceptada (no hay pago en HomIA).
- **Permisos (IDOR):** solo el solicitante y el vendedor ven y actúan (403 al resto). El proveedor
  no ve ni puede actuar sobre una devolución cuyo vendedor es el profesional; el cliente no ve la
  pata profesional → proveedor.

| Transición | Quién | Efecto |
|---|---|---|
"Vendedor" = proveedor o profesional según la tabla de arriba. Toda acción notifica a la otra parte
con link válido (vendedor proveedor → `#/panel/proveedor/cobros?tab=devoluciones`; vendedor
profesional → `#/panel/profesional/devoluciones?tab=clientes`; solicitante de la pata profesional →
`#/panel/profesional/devoluciones?tab=proveedores`; resto → su proyecto o pedido) y queda un
`ActivityEvent` (`devolucion_*`, con `returnId`, `tipo` y `sellerKind` en `data`) sobre el proyecto o
la compra.

| Transición | Quién | Efecto |
|---|---|---|
| (alta) → `solicitada` | Solicitante | Notifica al vendedor ("Te pidieron devolver sobrantes" / "Un profesional te pide devolver materiales"); mensaje en el chat si ya existe |
| `solicitada` sin respuesta **72 h** | Cron horario | **Un solo recordatorio** al vendedor: "Tenés una devolución sin responder" (`reminderSentAt`) |
| `solicitada` → `cancelada` | Solicitante | Notifica al vendedor |
| `solicitada` → `rechazada` | Vendedor (con motivo) | Ítems rechazados; notifica |
| `solicitada` → `aceptada` / `aceptada_parcial` | Vendedor | Puede aceptar menos y fijar un reembolso ≤ lo pagado por ítem; el total no puede superar lo reembolsable del pago original |
| `aceptada*` → `reembolsada` | Vendedor marca "recibido" y el pago fue por **MP** (pata cliente) | Stock vuelve solo si el vendedor es proveedor (`devolucion`); **reembolso automático por MP con el mismo token que cobró** (`refundChannel = mercadopago`); notifica "1 a 15 días" |
| `aceptada*` → `reembolso_fallido` | Idem, si MP falla | `reintentar_reembolso` (vendedor) |
| `aceptada*` → `recibida` | Vendedor marca recibido y el pago fue en **efectivo** o es la pata profesional → proveedor | Stock vuelve solo si el vendedor es proveedor |
| `recibida` → `reembolsada` | Vendedor "Ya lo reembolsé en efectivo" (`reembolsar_efectivo`, solo pata cliente; `refundChannel = efectivo`) | Notifica "confirmá que lo recibiste" |
| `recibida` → `reembolsada` | Proveedor `reembolsar_fuera` { `metodo`: efectivo \| transferencia \| saldo_a_favor, `nota` } (solo pata profesional → proveedor; `refundChannel = fuera_de_homia`, `refundMethod`, `refundMethodNote`) | Notifica al profesional "confirmá que lo recibiste". En la otra pata → 409 |
| Confirmación del efectivo / por fuera | **Solicitante** (`confirmar_reembolso`: "Recibí el reembolso") o **cron a las 72 h** (`refundConfirmedBy = automatico`) | Notifica a ambos; la devolución queda cerrada. No aplica a reembolsos por MP (409) |

**Con qué cuenta se reembolsa por MP** (`returns/[id]/route.ts`, `doRefund`): con la que cobró.
`Payment.collector = vendedor` (o compra histórica) → token del vendedor: **proveedor** en compras y
cobros, **profesional** en facturas (si no tiene MP conectado: "Tu cuenta de Mercado Pago no está
conectada: reconectala en Mi perfil y reintentá" → `reembolso_fallido`); pagos históricos de
facturas y cobros → token de la plataforma.

> **Resuelto por D14 (24/09/2026):** en modo A el profesional es el vendedor de la devolución:
> recibe los sobrantes y reembolsa desde su cuenta (o en efectivo). Si quiere, después se los
> devuelve a su proveedor por la pata profesional → proveedor (reembolso por fuera de HomIA).

### 12.3 Vinculaciones / cuentas de retiro (`ProviderLink`)

Acuerdo proveedor ↔ profesional para retirar materiales a cuenta de proyectos; **no mueve plata**
(`provider/links/route.ts:7-11`).

- El **proveedor** vincula a un profesional por email → nace **activa**.
- El **profesional** la pide a un proveedor por email → nace **inactiva** hasta que el proveedor la
  active.
- Solo el proveedor activa; el profesional solo puede pausar la suya (`:192-196`).
- Sin cuenta activa, el profesional **no puede proponer materiales de ese proveedor** en un proyecto
  (`projects/[id]/materials/route.ts:29-33`).

### 12.4 Crons

| Cron | Frecuencia | Qué hace | Fuente |
|---|---|---|---|
| `/api/cron/reservations` | Cada hora | Cancela sub-pedidos `aprobado` vencidos sin pago (compra: 24 h, o 7 días desde la compra con efectivo acordado; reserva: 48 h — D15); devuelve el stock de todos sus ítems; anula el cobro; avisa a ambos; evento `vencido`. **Además** corre las tareas de sobrantes (ambas patas): confirma solos los reembolsos en efectivo o por fuera de HomIA no confirmados en 72 h y manda un recordatorio único al vendedor (proveedor o profesional) por devoluciones sin responder hace 72 h (`src/lib/leftovers-cron.ts`) | `cron/reservations/route.ts` |
| `/api/cron/subscriptions` | Diario 09:30 UTC | Re-consulta a MP cada suscripción de pago con `mpPreapprovalId`; degrada si `cancelled`/`paused` o si lleva más de 35 días sin cobro; nunca degrada por error de MP; no toca planes sin `mpPreapprovalId` (demo/alta manual) | `cron/subscriptions/route.ts` |

Ambos exigen `Authorization: Bearer <CRON_SECRET>`.

---

### Proyectos que un profesional contrató (24/09/2026)

`GET /api/projects?role=profesional` devuelve además `contratados`: los proyectos donde el usuario de la
sesión es el **cliente** (contrató a otro profesional). Solo si tiene perfil de profesional; nunca de
otros usuarios. El detalle se abre en `/panel/profesional/proyectos/<id>` con la vista de cliente.

## 13. Catálogo de endpoints (65)

Convenciones: **Auth** = qué exige (`—` público, `Sesión`, o perfil/rol); los errores comunes son
401 sin sesión, 403 sin permiso, 404 inexistente, 409 estado inválido, 400 validación, 503 servicio
externo no disponible. Rutas relativas a `src/app/api/`. Cualquier `/api/*` que no exista responde
**404 JSON** "Esta ruta de la API no existe" (`[...slug]/route.ts`).

### Autenticación

| Método y ruta | Auth | Valida / hace | Errores clave |
|---|---|---|---|
| `POST /auth/register` | — (8/h por IP) | Email válido y único, contraseña ≥ 8 con letras y números, nombre 2–60, **`acceptTerms: true`** (guarda `termsAcceptedAt`/`termsVersion`, §1.1), roles válidos, nombre de negocio si es proveedor; crea usuario, perfiles, prueba de 14 días, CRM y sesión | 400 (`needsTerms`), 409 "Ya existe una cuenta con ese email", 429 |
| `POST /auth/login` | — (10 fallos email+IP, 30 por IP / 15 min) | Verifica contraseña, crea sesión | 401 "Email o contraseña incorrectos", 429 |
| `POST /auth/logout` | — | Borra la cookie | — |
| `GET /auth/me` | — | Usuario de la sesión o `null` | — |
| `POST /auth/password/forgot` | — (20/h por IP) | zod `email`. **Siempre 200** con "Si ese email tiene una cuenta, te mandamos un link para crear una nueva contraseña", exista o no. Si existe y tiene < 3 pedidos en la última hora: crea `PasswordReset` (sha256 del token, vence en 1 h) y manda el mail en segundo plano con `${APP_URL}/#/restablecer?token=…`. Con 3 pedidos en la hora: 200 igual, sin crear token (D18). **Sin `RESEND_API_KEY`: 503 `needsConfig` con "Todavía no podemos mandar mails…", igual para todos los emails y sin crear tokens** (fallback honesto) | 400 email inválido, 429, 503 |
| `GET /auth/password/reset?token=` | — (60 / 15 min por IP) | ¿El link sirve? | 400 `code` = `invalido` \| `usado` \| `vencido` |
| `POST /auth/password/reset` | — (60 / 15 min por IP) | zod `{ token, password }`; token válido (hash, no vencido, no usado); contraseña con la **misma política que el registro** (≥ 8, letras y números); en una transacción: toma el token, cambia el hash bcrypt, marca usado e **invalida los otros pendientes** del usuario. **No inicia sesión.** Las sesiones abiertas en otros dispositivos no se cierran (el JWT no tiene estado) (D18) | 400 `code` = `invalido`/`usado`/`vencido`/`contrasena` |

### Perfiles y usuarios

| Método y ruta | Auth | Valida / hace | Errores clave |
|---|---|---|---|
| `GET /profiles/me` | Sesión | Perfil completo; DNI como URL firmada de 10 min; sin tokens MP | 401 |
| `PUT /profiles/me` | Sesión | zod: datos personales, profesionales y de proveedor; avatar/logo solo de HomIA; marca solo con PRO; `emailNotifications` (boolean, avisos por mail, §14.1); escribe todo en una transacción | 403 `needsRole`/`needsPro` |
| `POST /profiles/me/eliminar` | Sesión | zod `confirm: "ELIMINAR"` + `password`; bloquea con operaciones abiertas; borra DNI del bucket y anonimiza (§1.1, D19) | 400, 401, 403 contraseña, 409 `pendientes`, 429, 503 Storage |
| `GET /profiles/professional/[id]` | Sesión | Perfil, 12 obras, 20 reseñas, `chatBlocked`; cuenta eliminada o demo con `HIDE_DEMO_USERS=1` → 404 salvo al propio usuario (§1.2) | 401, 404 |
| `GET /profiles/professional/[id]/availability` | — (público) | zod en query (`from`/`to` `AAAA-MM-DD`, máx. 186 días). Solo rangos anónimos unidos (`ocupado`/`por_confirmar`), `proximaFechaLibre`, `disponibleEstaSemana` (§3.6, D21) | 400, 404 |
| `GET /profiles/provider/[id]` | Sesión | Perfil, stock (100), reseñas, `recommended`, `chatBlocked`; misma regla de visibilidad (§1.2) | 401, 404 |
| `GET /users/[id]/client-summary` | Sesión | Reputación del cliente: proyectos finalizados/activos, compras, 10 reseñas | 401, 404 |
| `PUT /users/location` | Sesión | lat/lng/radio 1–500/compartir; sincroniza el perfil profesional | 400 |

### Catálogo, búsqueda y directorio

| Método y ruta | Auth | Valida / hace | Errores clave |
|---|---|---|---|
| `GET /catalog` | — | Categorías con elementos activos | — |
| `POST /catalog` | Rol proveedor | Nombre 3–80, categoría; anti-duplicado; IA redacta descripción/alias/unidad (fallback honesto) | 403, 400 |
| `GET /search` | — | `mode=cliente`: profesionales + trabajos + materiales; `mode=profesional`: materiales + trabajos; filtros q, cat, radio, urgencia; Recomendados primero | — |
| `GET /search/pins` | — | Pines del mapa (40 pro/material, 30 trabajos) | — |
| `GET /directory` | — | Profesionales y proveedores operativos; orden por reseñas/rating/obras/recientes; PRO primero; filtros rubro, rating, precio | — |
| `GET /comparables` | — | Mismo elemento entre proveedores, por precio; marca Recomendado | — |
| `GET /marketplace` | — | Elementos que coinciden + ofertas de proveedores operativos; registra la búsqueda (≥ 3 letras) para la analítica | — |
| `GET /sponsors` | — | Cinta de sponsors (§8) | — |

### Trabajos y ofertas

| Método y ruta | Auth | Valida / hace | Errores clave |
|---|---|---|---|
| `GET /jobs` | — (o sesión con `mine=1`) | Bolsa abierta (60, filtros, radio) o mis trabajos con ofertas | 401 con `mine=1` |
| `POST /jobs` | Sesión | §2.1; notifica a profesionales del rubro | 400 |
| `GET /jobs/[id]` | — | Detalle; sin sesión, sin dirección y ubicación aproximada | 404 |
| `PATCH /jobs/[id]` | Dueño | Cerrar/cancelar/reabrir (§2.1) | 403, 409 |
| `GET /jobs/[id]/bids` | Dueño (todas) o profesional (la suya) | — | 403 |
| `POST /jobs/[id]/bids` | Perfil profesional | §2.2 | 403, 409 |
| `GET /bids?mine=1` | Perfil profesional | Mis ofertas con su proyecto si fue aceptada | 400 sin `mine`, 403 |
| `PATCH /bids/[id]` | Dueño del trabajo (aceptar/rechazar) o autor (retirar) | zod; §2.2 | 403, 409 |

### Proyectos, materiales y facturas

| Método y ruta | Auth | Valida / hace | Errores clave |
|---|---|---|---|
| `GET /projects` | Sesión | Mis proyectos como cliente y como profesional, con `canReview` | — |
| `POST /projects` | Sesión | zod; asistente Contratar o subcontratación; opcional `jobId` (trabajo propio abierto) **o** `parentProjectId` (proyecto activo propio como profesional) (§3.1, D16) | 400, 403, 404, 409 |
| `GET /projects/hire-sources` | Sesión | zod en query (`professionalProfileId` opcional). Solo del usuario de la sesión: `jobs` = sus trabajos `abierto` (hasta 30: título, rubro, fecha, ofertas pendientes, datos para precargar y `targetBidAmount` si el profesional a contratar ya ofertó) y `projects` = sus proyectos `activo` no finalizados como profesional a cargo (hasta 30: título, cliente, etapa, datos para precargar) | 400, 401 |
| `GET /projects/[id]` | Partes | Detalle con materiales, facturas, cobros, cuentas de retiro, id del chat; `subcontracts` (solo al profesional a cargo) y `parentProject` (solo al profesional que subcontrató) (D16); `schedule` (fechas del trabajo) y `scheduleBlocked` (por qué todavía no se pueden acordar, o `null`) (D21) | 403, 404 |
| `PATCH /projects/[id]` | Partes | zod; etapa, cancelación, mano de obra, modo de materiales (§3.2) | 403, 409 |
| `POST /projects/[id]/schedule` | Partes | zod (`accion` = `proponer` con `startDate`/`endDate`/`nota` \| `aceptar` \| `rechazar` con `motivo`); máquina de estados de fechas, aviso de solapamiento (§3.6, D21) | 400, 401, 403, 404, 409 |
| `GET /professional/calendar` | Profesional (de la sesión) | zod en query (`from`/`to`, máx. 190 días); sus proyectos con fechas, `sinFecha` y `pendientes` (§3.6) | 400, 401, 403 |
| `POST /projects/[id]/materials` | Profesional del proyecto | zod; §3.4 | 403, 409 |
| `PATCH /projects/[id]/materials` | Partes según acción | zod; aprobar/rechazar/eliminar/reemplazar (§3.4) | 403, 404, 409 |
| `GET /projects/[id]/invoice` | Partes | Facturas con ítems | 403 |
| `POST /projects/[id]/invoice` | Profesional del proyecto | §3.5 | 403, 409, 503 |
| `GET /invoices?mine=1[&estado=pendientes|cobradas|todas]` | Profesional (perfil) | Cobros: sus facturas de todos los proyectos + resumen (§3.5) | 400, 401, 403 |
| `GET /invoices/[id]` | Partes | Detalle | 403, 404 |
| `GET /invoices/[id]` devuelve también `mpServiceFee` y `professional.mpConnected` | | | |
| `POST /invoices/[id]` | Cliente | Preferencia MP con token del profesional + cargo 1% | 403, 503 `needsConfig` |
| `POST /invoices/[id]/cash` | Cliente (acordar/cancelar) o profesional (confirmar) | §3.5 | 403 |
| `GET /invoices/[id]/pdf` | Partes | PDF A4 con pdf-lib (incluye el cargo de servicio si se pagó por MP) | 403, 404 |

### Compras, cobros y sobrantes

| Método y ruta | Auth | Valida / hace | Errores clave |
|---|---|---|---|
| `GET/POST/PATCH/DELETE /cart` | Sesión, rol cliente o profesional | Carrito en la base; ver, agregar, cambiar cantidad, sacar (máx. 60) (§4.1) | 401, 403, 404, 409 |
| `POST /cart/merge` | Sesión, rol que compra | zod; fusiona el carrito del visitante (≤ 60 líneas) | 401, 403 |
| `POST /cart/preview` | — | zod; arma la vista del carrito del visitante con precios y problemas actuales | 400 |
| `GET /orders` | Sesión | Mis pedidos con resumen de pago | 401 |
| `POST /orders` | Sesión, rol que compra | zod (`lineTypes`, `types`, `note`); confirma el carrito: compras por pagar con stock reservado, reservas pendientes (§4.2) | 400 vacío, 409 problemas o stock que no alcanza (nada creado), 503 |
| `GET /orders/[id]` | Dueño | Pedido con sub-pedidos y línea de tiempo | 403, 404 |
| `GET /purchases` | Sesión (`as=proveedor` exige perfil) | Mis compras o mis ventas (con ítems, cobro y línea de tiempo) | 403 |
| `POST /purchases` | Sesión | zod (`type` opcional); pedido de un solo producto vía `createOrder` | 404, 409 |
| `PATCH /purchases/[id]` | Cliente o proveedor del sub-pedido | zod: `action` (`aprobar`, `rechazar`, `cancelar`, `pagar_efectivo`, `pagar_mp`, `entregar`, `disponible`), `unitPrice`, `reason`, `availableFrom`; §4.3 | 400 (`needsReason`, fecha), 403, 409 (`needsDate`, `needsMp`), 502 (reembolso MP falló), 503 |
| `GET /charges/[id]` | Cliente o proveedor del cobro | — | 403 |
| `POST /charges/[id]` | Cliente del cobro | `method` mercadopago (token del proveedor + 1%) / efectivo (sin cargo); solo `pendiente` | 403, 503 `needsConfig` |
| `PATCH /charges/[id]` | Proveedor dueño | Confirmar efectivo acordado | 403 |
| `GET /provider/charges` | Perfil proveedor | Cobros emitidos + materiales por cobrar agrupados por proyecto | 403 |
| `POST /provider/charges` | Perfil proveedor, plan activo | §5 | 403 `needsPlan`, 503 |
| `GET /returns` | Sesión; `role=solicitante` (default) \| `proveedor` (exige perfil; solo vendedor proveedor) \| `profesional` (exige perfil; solo vendedor profesional); filtros `tipo`, `projectId`, `purchaseId` | Devoluciones con origen, `sellerName` y `sellerUserId` | 403 |
| `POST /returns` | Solicitante válido; `tipo` = `cliente` (default) \| `profesional_a_proveedor` (solo el pro del proyecto; `parentReturnId` opcional) | zod; §12.2 | 400, 403, 404, 409 |
| `GET /returns/eligible` | Partes del proyecto o cliente de la compra; `tipo=profesional_a_proveedor` solo el pro | Qué se puede devolver, a quién (`sellerKind`, `sellerName`) y cuánto; en la pata pro → proveedor además `prefill` | 403 |
| `PATCH /returns/[id]` | Solicitante (`cancelar`, `confirmar_reembolso`) o vendedor (`aceptar`, `rechazar`, `recibir`, `reembolsar_efectivo`, `reembolsar_fuera`, `reintentar_reembolso`) | zod; §12.2 | 400, 403, 409, 503 |

### Proveedor

| Método y ruta | Auth | Valida / hace | Errores clave |
|---|---|---|---|
| `GET /provider/stock` | Sesión | Mi stock con filtros (búsqueda difusa) | — |
| `POST /provider/stock` | Perfil proveedor, plan activo | zod; alta de un elemento | 403 `needsPlan`, 409 |
| `PATCH /provider/stock` | Idem | zod; precio, cantidad, mínimo, marca, foto; registra movimiento | 404 |
| `DELETE /provider/stock?id=` | Idem | Borra la entrada | 404 |
| `GET/POST/PATCH /provider/links` | Perfil proveedor o profesional | zod; §12.3 | 403, 409 |
| `GET /provider/plan` | Perfil proveedor | Estado del plan, precios, si MP está configurado | 403 |
| `POST /provider/plan` | Perfil proveedor | zod `basic`/`pro`; crea preapproval | 409 mismo plan, 503 |
| `GET /provider/analytics` | Perfil proveedor con PRO activo | §8 | 403 `needsPlan`/`needsPro` |
| `POST /pro/subscription` | Perfil profesional | Legado: siempre 403 "HomIA es gratis para profesionales" | 403 |
| `GET /pro/subscription` | — | `{ free: true }` | — |

### Mercado Pago

| Método y ruta | Auth | Valida / hace | Errores clave |
|---|---|---|---|
| `GET /mp/oauth/connect?kind=provider\|professional` | Sesión + perfil | Inicia OAuth con PKCE (§ técnico 6.1) | Redirige con `?mp=error` |
| `GET /mp/oauth/callback` | Sesión dueña del `state` | Canjea el código y guarda tokens | Redirige con `?mp=…` |
| `DELETE /mp/oauth?kind=provider\|professional` | Perfil del tipo | Desconecta | 403 |
| `POST /payments/webhook` | Firma MP (no bloqueante) | Pista `?ref=<tipo>:<id>` → consulta con el token del vendedor; monto = subtotal + cargo ±1; guarda `Payment.collector` (técnico §6.1) | 200 `deferred` si MP falla; 500 si falla la base |

### Comunicación, reputación y otros

| Método y ruta | Auth | Valida / hace | Errores clave |
|---|---|---|---|
| `GET /messages/conversations` | Sesión | Bandeja (hasta 200) con último mensaje y no leídos, en 1 consulta | — |
| `POST /messages/conversations` | Sesión | Abre o reutiliza el hilo; regla §10 | 403 `clientesFirst`, 404 |
| `GET /messages/conversations/[id][?after=ISO]` | Participante | 300 mensajes (o solo los nuevos con `after`) + `readUpTo`; marca leídos (§10) | 400, 403, 404 |
| `POST /messages/conversations/[id]` | Participante | 1–4000 caracteres; notifica | 403 |
| `GET /messages/unread` | Sesión | Total de no leídos | — |
| `GET /notifications` | — (vacío sin sesión) | 50 últimas + no leídas | — |
| `PATCH /notifications` | Sesión | Marca una o todas | — |
| `GET /reviews` | — | Reseñas recibidas por `targetUserId` o las mías (`mine=1`) | — |
| `POST /reviews` | Sesión | §9 | 403, 409 |
| `GET /works` | — (`professionalId`) o sesión (mías) | Obras visibles | — |
| `POST /works` | Sesión | zod; título 3–120, descripción 10–4000, 4 fotos; vincula al perfil profesional | 400 |
| `PATCH /works/[id]` | Autor | zod; edita | 403, 404 |
| `DELETE /works/[id]` | Autor | Baja lógica y descuenta del contador | 403 |
| `GET/POST /favorites` | Sesión | Lista / alterna favorito | 404 |
| `GET/POST /crm/pipelines` | Sesión | Tablero (crea el default) / tablero nuevo con 3 etapas | 400 |
| `POST/PATCH/DELETE /crm/deals` | Dueño del tablero | Tratos; el tablero sale de la etapa validada | 403, 404 |
| `POST /uploads` | Sesión | JPG/PNG/WEBP por bytes, ≤ 8 MB; `folder=dni` al bucket privado | 400, 503 |
| `GET/POST /verification/dni` | Sesión | §11 | 429 |
| `POST /homy/agent` | — (cupo 8/día por IP o 60/día por usuario) | zod; súper agente con stream NDJSON; registra `HomyRun` y la sesión (§11) | 400; evento `limite` con el cupo agotado |
| `GET /homy/agent?sessionId=` | Dueño de la sesión (usuario o token de visitante) | Historial (30 mensajes) y cupo | — |
| `GET /cron/reservations` | `CRON_SECRET` | §12.4 | 401 |
| `GET /cron/subscriptions` | `CRON_SECRET` | §12.4 | 401 |

---

## 14. Notificaciones

Cada evento de negocio crea una `Notification` con `link` al hash de la pantalla correspondiente. Se
consultan cada 15 segundos desde el panel (`panel-layout.tsx:107-118`). Los avisos de pedidos llevan
a `#/panel/<cliente|profesional>/pedidos/<id>`; el de "Factura pagada" por MP lleva al proyecto del
profesional (antes apuntaba a una página inexistente; corregido en `2eed864`).

### 14.1 Avisos por mail (D18, 24/09/2026)

- **Qué eventos mandan mail** (lista blanca `TIPOS_CON_MAIL` en `src/lib/notify.ts`; los demás
  tipos solo quedan en la campana):

  | `type` | A quién | Dónde se crea |
  |---|---|---|
  | `nueva_compra` | Proveedor (compra directa o reserva nueva) | `src/lib/orders.ts` |
  | `reserva_aprobada_sin_stock`, `compra_aprobada`, `reserva_disponible` | Cliente | `purchases/[id]/route.ts` |
  | `contratacion` | Profesional contratado | `projects/route.ts` |
  | `presupuesto_aceptado` | Profesional | `bids/[id]/route.ts`, `projects/route.ts` (contratar desde un trabajo con su oferta) |
  | `nuevo_presupuesto` | Cliente dueño del trabajo | `jobs/[id]/bids/route.ts` |
  | `factura_emitida` | Cliente | `projects/[id]/invoice/route.ts` |
  | `compra_pagada_prov`, `cobro_pagado` (solo al proveedor, no al que paga), `factura_pagada` | Quien cobra por Mercado Pago | `payments/webhook/route.ts` |
  | `devolucion_solicitada` | Quien recibe el pedido de devolución (proveedor o profesional) | `returns/route.ts` |

- **No mandan mail:** mensajes del chat (`message`), ni el resto de los avisos.
- **Preferencia:** `User.emailNotifications` (default `true`). Se cambia con
  `PUT /profiles/me { emailNotifications }`. Apagada → solo campana. El mail de recuperar
  contraseña **no** depende de esta preferencia.
- **Nunca rompe la acción:** la notificación se crea como siempre y el mail se programa para
  **después de responder** (`after()` de Next). Si Resend falla, tarda o no está configurado, la
  compra/contratación/etc. responde igual (verificado con un doble de Resend que devuelve 500).
  Dentro de una transacción el mail se programa recién después del commit.
- **Sin `RESEND_API_KEY`:** no se intenta enviar (un `console.warn` por proceso).
- Emails de dominios reservados (`.test`, `.invalid`, `.example`, `.localhost`, como las cuentas
  demo `@homia.test`) nunca se mandan a Resend real.

## Textos legales = espejo de las reglas (24/09/2026)

Los Términos y la Política de Privacidad (`src/lib/legal-content.ts`) repiten, en lenguaje simple,
las reglas de este documento: cargo de servicio 1% solo con Mercado Pago y no reembolsable en
sobrantes; compra con stock sin aprobación y 24 h para pagar (7 días en efectivo); reservas aprobadas
por el proveedor, 48 h; sobrantes 30 días, recordatorio y autoconfirmación a las 72 h; planes
$50.000 / $100.000 con 14 días de prueba y baja de la vidriera por cancelación, pausa o 35 días sin
cobro; cancelación de proyecto solo en presupuesto o materiales; 3 intentos de DNI por día; Homy 8/60
consultas por día; fechas del proyecto propuestas y aceptadas por la otra parte. **Si cambia una de
estas reglas, se cambia el texto legal en la misma rama y se sube `LEGAL_VERSION`.**

