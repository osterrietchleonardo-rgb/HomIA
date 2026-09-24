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

---

## 2. Trabajos publicados (`JobPost`) y ofertas (`JobBid`)

### 2.1 JobPost

Estados: `abierto` → `en_proceso` | `cerrado` | `cancelado` (`prisma/schema.prisma:244`).

| Transición | Quién | Condición | Fuente |
|---|---|---|---|
| (alta) → `abierto` | Cualquier usuario logueado | Título, descripción y rubro obligatorios; rubro tiene que existir; presupuesto ≥ 0 y mín ≤ máx; hasta 6 fotos de HomIA | `jobs/route.ts:81-137` |
| `abierto` → `en_proceso` | Sistema, al aceptar una oferta | Dentro de la transacción de aceptación | `bids/[id]/route.ts:111-114` |
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
   (`projects/route.ts:198-205`).

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

---

## 4. Carrito, pedidos y compras de materiales

Desde el commit `2eed864` las compras de materiales van por **carrito y pedidos multiproveedor**.
Un **pedido** (`Order`, número `PED-AAAA-NNNNNN`) se parte en un **sub-pedido** (`Purchase`) por
proveedor, con sus productos (`PurchaseItem`). Cada sub-pedido sigue su propia máquina de estados y
se paga por separado. Las compras de un solo producto hechas antes quedan como "Compra anterior".

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
  proveedor opera, hay stock, la cantidad respeta el paso de la unidad (**de a 1** por pieza, **de
  a 0,5** en metro, m2, m3, kg y litro — `src/lib/units.ts`) y no supera el stock.
- **Vista:** agrupado por proveedor con subtotal, "Cargo de servicio HomIA (1%) — solo si pagás con
  Mercado Pago" y "Total con Mercado Pago"; cada línea marca su problema (no existe, sin stock,
  stock insuficiente, proveedor inactivo, propio) y **no se puede confirmar** mientras haya alguno
  (`cart-server.ts`). Vaciar pide confirmación.

### 4.2 Confirmar el pedido

`POST /api/orders` (`orders/route.ts:28-58`): exige sesión y rol que compra; zod: `types`
(por proveedor `compra` = 7 días para retirar, `reserva` = 48 h) y `note` (≤ 500). Re-valida todas
las líneas (`validateLines`, `src/lib/orders.ts:103-129`); si alguna falla responde 409 con el primer
problema. `createOrder` (`orders.ts:143-242`) crea en **una transacción** el `Order` y un `Purchase`
por proveedor con sus ítems, en `pendiente_aprobacion` y **sin tocar el stock**. Después, a cada
proveedor: mensaje en el chat **iniciado por el cliente** con el detalle, notificación "Nuevo pedido
de un cliente" y eventos `pedido_creado`/`subpedido_creado` en la línea de tiempo. Del carrito se
borra solo lo que se pidió.

`POST /api/purchases` (pedido de un solo producto, compatibilidad) usa el mismo `createOrder` con
`source: 'directo'` (`purchases/route.ts:111-131`).

### 4.3 Máquina de estados del sub-pedido (`purchases/[id]/route.ts`)

| Transición | Quién | Condición | Efecto |
|---|---|---|---|
| `pendiente_aprobacion` → `aprobado` | Proveedor con plan activo | En compras históricas de un ítem puede fijar el precio; **reserva atómica de TODOS los ítems**: si uno no alcanza, no se reserva ninguno ("No te alcanza el stock de…") | Crea `ProviderCharge` `pendiente`; vencimiento 48 h (reserva) o 7 días (compra); notifica; evento en la línea de tiempo (`:186-280`) |
| `pendiente_aprobacion` → `rechazado` | Proveedor | Motivo opcional; se rechaza la parte entera | Notifica (`:284-300`) |
| `pendiente_aprobacion`/`aprobado` → `cancelado` | Cliente o proveedor | Cobro no pagado; `updateMany` condicional | Si estaba aprobado libera **todos** los ítems; cobro `anulada` (`:85-116`) |
| Pagar en efectivo | Cliente | Desde `aprobado` o `entregado`, con cobro emitido | Cobro `acordada_efectivo`, `serviceFee = 0` (`:132-148`) |
| Pagar por MP | Cliente | Desde `aprobado` o `entregado`; proveedor con MP conectado | Preferencia con el **token del proveedor**, cargo = 1% del subtotal del sub-pedido; sin conexión: 503 `needsConfig` "‹Proveedor› todavía no conectó Mercado Pago: podés pagar en efectivo" (`:150-177`) |
| → `entregado` / `pagado` | Proveedor | No entregado antes | Movimiento `consumo` por ítem; nunca retrocede desde pagado (`:302-340`) |
| → `pagado` | Webhook (MP) o proveedor al confirmar efectivo | — | Cobro `pagada`; habilita la reseña de la compra |
| `aprobado` → `cancelado` por vencimiento | Cron horario | Plazo vencido y cobro no pagado | Libera todos los ítems, anula el cobro, avisa a ambos, evento `vencido` (`cron/reservations/route.ts`) |

Todas las acciones del proveedor exigen plan activo. Cada acción queda en `ActivityEvent`.

### 4.4 Seguimiento del pedido ("Mis pedidos")

`GET /api/orders` y `GET /api/orders/[id]` (dueño; 404/403) devuelven cada pedido con su resumen
(`src/lib/order-view.ts:100-116`): proveedores activos (no rechazados/cancelados), cuántos pagaron,
**monto pendiente** y estado `esperando` (todos esperando aprobación) | `en_curso` | `completo` |
`cerrado` (ningún proveedor activo). El proveedor ve **solo su parte** del pedido, con su línea de
tiempo, en Cobros → Ventas.

---

## 5. Cobros del proveedor (`ProviderCharge`)

Nacen en dos casos: (1) al **aprobar un sub-pedido** (§4.3) y (2) cuando el proveedor **emite un
cobro por los materiales aprobados** de un proyecto en **modo B**.

- **Emitir cobro de proyecto** (`POST /api/provider/charges`, `provider/charges/route.ts:84-157`):
  proveedor con plan activo; proyecto en modo B; no al propio usuario; **un solo cobro abierto
  (`pendiente` o `acordada_efectivo`) por proyecto**; incluye los materiales aprobados de ese
  proveedor que no estén en cobros anteriores (`materialIds`, evita doble cobro); número
  `PRV-<año>-<000001>` con reintento (`src/lib/charge-number.ts`). Notifica "Cobro de materiales del
  proveedor".
- **Estados:** `pendiente` → `acordada_efectivo` → `pagada`; `pendiente` → `pagada` (MP); cualquier
  no pagado → `anulada` (cancelación o vencimiento del sub-pedido).

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
  (edición manual), `reserva` (aprobación de material o compra), `liberacion` (rechazo, reemplazo,
  cancelación, vencimiento), `consumo` (entrega de compra), `devolucion` (sobrantes recibidos).
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
- Enviar: 1–4000 caracteres; notifica "Nuevo mensaje de …"; abrir el hilo marca como leídos los
  mensajes del otro (`messages/conversations/[id]/route.ts`).

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

- **Proveedor:** conecta desde Cobros; **profesional:** desde Mi perfil, tarjeta "Cobrá con tu
  Mercado Pago" (`src/components/app/mp-connect-card.tsx`). Ambos por
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
| `/api/cron/reservations` | Cada hora | Cancela sub-pedidos `aprobado` vencidos (48 h reserva / 7 días compra) sin pago; devuelve el stock de todos sus ítems; anula el cobro; avisa a ambos; evento `vencido`. **Además** corre las tareas de sobrantes (ambas patas): confirma solos los reembolsos en efectivo o por fuera de HomIA no confirmados en 72 h y manda un recordatorio único al vendedor (proveedor o profesional) por devoluciones sin responder hace 72 h (`src/lib/leftovers-cron.ts`) | `cron/reservations/route.ts` |
| `/api/cron/subscriptions` | Diario 09:30 UTC | Re-consulta a MP cada suscripción de pago con `mpPreapprovalId`; degrada si `cancelled`/`paused` o si lleva más de 35 días sin cobro; nunca degrada por error de MP; no toca planes sin `mpPreapprovalId` (demo/alta manual) | `cron/subscriptions/route.ts` |

Ambos exigen `Authorization: Bearer <CRON_SECRET>`.

---

## 13. Catálogo de endpoints (64)

Convenciones: **Auth** = qué exige (`—` público, `Sesión`, o perfil/rol); los errores comunes son
401 sin sesión, 403 sin permiso, 404 inexistente, 409 estado inválido, 400 validación, 503 servicio
externo no disponible. Rutas relativas a `src/app/api/`. Cualquier `/api/*` que no exista responde
**404 JSON** "Esta ruta de la API no existe" (`[...slug]/route.ts`).

### Autenticación

| Método y ruta | Auth | Valida / hace | Errores clave |
|---|---|---|---|
| `POST /auth/register` | — (8/h por IP) | Email válido y único, contraseña ≥ 8 con letras y números, nombre 2–60, roles válidos, nombre de negocio si es proveedor; crea usuario, perfiles, prueba de 14 días, CRM y sesión | 400, 409 "Ya existe una cuenta con ese email", 429 |
| `POST /auth/login` | — (10 fallos email+IP, 30 por IP / 15 min) | Verifica contraseña, crea sesión | 401 "Email o contraseña incorrectos", 429 |
| `POST /auth/logout` | — | Borra la cookie | — |
| `GET /auth/me` | — | Usuario de la sesión o `null` | — |

### Perfiles y usuarios

| Método y ruta | Auth | Valida / hace | Errores clave |
|---|---|---|---|
| `GET /profiles/me` | Sesión | Perfil completo; DNI como URL firmada de 10 min; sin tokens MP | 401 |
| `PUT /profiles/me` | Sesión | zod: datos personales, profesionales y de proveedor; avatar/logo solo de HomIA; marca solo con PRO; escribe todo en una transacción | 403 `needsRole`/`needsPro` |
| `GET /profiles/professional/[id]` | Sesión | Perfil, 12 obras, 20 reseñas, `chatBlocked` | 401, 404 |
| `GET /profiles/provider/[id]` | Sesión | Perfil, stock (100), reseñas, `recommended`, `chatBlocked` | 401, 404 |
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
| `POST /projects` | Sesión | zod; asistente Contratar o subcontratación (§3.1) | 400, 404 |
| `GET /projects/[id]` | Partes | Detalle con materiales, facturas, cobros, cuentas de retiro, id del chat | 403, 404 |
| `PATCH /projects/[id]` | Partes | zod; etapa, cancelación, mano de obra, modo de materiales (§3.2) | 403, 409 |
| `POST /projects/[id]/materials` | Profesional del proyecto | zod; §3.4 | 403, 409 |
| `PATCH /projects/[id]/materials` | Partes según acción | zod; aprobar/rechazar/eliminar/reemplazar (§3.4) | 403, 404, 409 |
| `GET /projects/[id]/invoice` | Partes | Facturas con ítems | 403 |
| `POST /projects/[id]/invoice` | Profesional del proyecto | §3.5 | 403, 409, 503 |
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
| `POST /orders` | Sesión, rol que compra | zod; confirma el carrito (§4.2) | 400 vacío, 409 problemas, 503 |
| `GET /orders/[id]` | Dueño | Pedido con sub-pedidos y línea de tiempo | 403, 404 |
| `GET /purchases` | Sesión (`as=proveedor` exige perfil) | Mis compras o mis ventas (con ítems, cobro y línea de tiempo) | 403 |
| `POST /purchases` | Sesión | zod; pedido de un solo producto vía `createOrder` | 404, 409 |
| `PATCH /purchases/[id]` | Cliente o proveedor del sub-pedido | zod; §4.3 | 403, 409, 503 |
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
| `GET /messages/conversations` | Sesión | Bandeja con último mensaje y no leídos | — |
| `POST /messages/conversations` | Sesión | Abre o reutiliza el hilo; regla §10 | 403 `clientesFirst`, 404 |
| `GET /messages/conversations/[id]` | Participante | 300 mensajes; marca leídos | 403 |
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
