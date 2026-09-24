# Auditoría integral de HomIA — 23 de septiembre de 2026

Alcance: código completo del working tree (incluye cambios sin commitear), 56 endpoints, 31 modelos Prisma, todas las pantallas SPA, contenido de ayuda/tour, y recorrido de punta a punta desde los tres roles (cliente, profesional, proveedor) más el visitante anónimo. Todo lo que figura acá fue leído en el código fuente; las líneas citadas corresponden al working tree de hoy. No se modificó ningún archivo de la aplicación.

Método: seis auditorías paralelas (backend core y seguridad, lógica de negocio, home y pantallas públicas, panel cliente, panel profesional, panel proveedor) más verificación cruzada de cada hallazgo crítico, `tsc --noEmit` y `eslint` sobre `src/`.

---

## 1. Veredicto

HomIA tiene una base muy buena: design system consistente, mobile app-shell real, router propio sin rutas rotas, cero fetch a endpoints inexistentes, autorización de ownership correcta en la mayoría de los recursos, reseñas 360° con reglas serias, verificación DNI con fallback honesto, y un catálogo de 1247 elementos con búsqueda difusa bien resuelta.

Pero **el producto no está listo para producción**, y el problema no es cosmético:

1. **El working tree no compila en TypeScript** (6 errores) y `next.config.ts` los esconde con `ignoreBuildErrors: true`. Tres de esos errores son crashes de runtime garantizados (`ReviewForm`, `useRef`, `fetchMe` no definidos).
2. **El flujo de dinero del proveedor no cierra**: una compra directa de materiales nunca puede pagarse desde la UI, el stock nunca se descuenta ni reserva, no existe interfaz para conectar Mercado Pago por OAuth, y el webhook de pagos no verifica firma ni es idempotente.
3. **La verificación de DNI está rota en Vercel**: lee las fotos del filesystem local, pero los uploads ya viven en Supabase Storage. Nadie puede verificarse.
4. **El marketing promete cosas que el código no hace**: escrow ("el dinero se retiene hasta que apruebes"), reembolso automático de sobrantes, pedidos pre-pagados, visitas agendadas por IA, "sin costo de entrada" para un rol que paga US$50/mes. Las rutas de escrow figuran borradas en `git status`.
5. **Mobile-first roto en el panel**: el bottom nav muestra solo 5 ítems y ningún rol puede llegar desde el celular a Perfil, Verificación, Facturas, Obras, Presupuestos ni Ayuda. Al cliente además se le cae "Mensajes".
6. **Contratos front↔API desalineados** en varios puntos clave: estados de compra inventados por el front (`solicitado`/`aceptado` vs `pendiente_aprobacion`/`aprobado`), campos que el front lee y la API no devuelve (facturas sin fecha ni proyecto, proyectos sin nombre de contraparte), `user.role` que no existe (la sesión expone `roles[]`).

Las notas por dimensión promedian entre 3 y 7 sobre 10. Flujo y consistencia son las más bajas en los tres roles.

---

## 2. Estado objetivo del código (verificado hoy)

| Chequeo | Resultado |
|---|---|
| `npx tsc --noEmit` | **6 errores** (exit 2) |
| `npx eslint src` | **2 errores, 1 warning** |
| `next.config.ts` | `typescript.ignoreBuildErrors: true`, `reactStrictMode: false` |
| `tsconfig.json` | `noImplicitAny: false` |
| `$transaction` en `src/` | 0 usos |
| `stockReservation` en `src/` | 0 usos (modelo muerto) |
| `maxDuration` en rutas API | 0 (AGENTS §12.3 lo exige) |
| `@dnd-kit/*` importado | 0 (instalado, sin uso; el CRM no tiene drag & drop) |
| zod en bodies | 4 de 56 rutas (AGENTS §4 y §10 dicen "todos") |
| `console.log` / TODO reales | 0 |

### Errores de TypeScript (todos son bugs reales, no solo tipos)

| Archivo:línea | Error | Efecto en runtime |
|---|---|---|
| `src/components/screens/panel/profesional/proyecto-detalle.tsx:661` | `ReviewForm` no está importado | **Crash** al abrir cualquier proyecto finalizado sin reseña (pantalla en blanco) |
| `src/components/screens/panel/proveedor/stock.tsx:596` | `useRef` no está importado | **Crash** al renderizar el subidor de foto de material |
| `src/components/screens/panel/proveedor/perfil.tsx:234` | `fetchMe` no existe (la función es `load`) | **Crash** al pulsar ese botón |
| `src/components/screens/panel/cliente/materiales.tsx:241` | `user.role` no existe (es `roles[]`) | La tab "Comparables" del profesional nunca aparece |
| `src/components/app/app-root.tsx:188` | Se pasa prop `role` a un componente que no la acepta | El profesional ve la pantalla de materiales del cliente y sus tabs lo mandan a `/panel/cliente/...`, de donde el layout lo expulsa |
| `src/components/screens/marketplace-screen.tsx:168` | `EmptyState icon={Package}` recibe una función en vez de un nodo | Ícono no se renderiza, texto de ayuda perdido |

---

## 3. Hallazgos críticos transversales (ordenados por impacto)

### C1. Verificación de DNI nunca corre la IA en producción
`src/lib/dni-ai.ts:63-74` hace `path.join(process.cwd(), 'public', rel)` + `readFile`. `src/app/api/uploads/route.ts:42` devuelve URLs `https://…supabase.co/storage/…`. Resultado: `toDataUrl` devuelve `null`, `analyzeDniImages` responde `en_revision` con "No pudimos leer las imágenes" sin llamar al modelo. **Ningún usuario puede obtener el badge "verificado".**
Fix: si la URL es http(s), validar que pertenezca al bucket y a la carpeta del usuario, hacer `fetch()` con timeout y convertir a base64 (o pasar la URL al modelo de visión). Además: bucket privado para DNI con signed URLs (la migración `0010_storage_policies.sql` ya define `dni-docs` privado y no se usa).

### C2. Compra directa de materiales: el pago es inalcanzable
- `src/components/screens/panel/cliente/materiales.tsx:607` muestra "Pagar" solo si `p.chargeId` existe. **Ningún endpoint escribe `Purchase.chargeId`** (`purchases/[id]/route.ts:113-117` en `entregar` solo cambia el status).
- `materiales.tsx:53-59` define estados `solicitado`/`aceptado`; la API produce `pendiente_aprobacion`/`aprobado`/`rechazado`. Un pedido aprobado o rechazado se muestra como "Pedido enviado"; "Cancelar pedido" (`:597`) nunca aparece; el contador del tab (`:251`) siempre da 0.
- La reseña post-compra (`:617`) exige `pagado`, inalcanzable. Y `hasReseña` (`:223`) consulta sin `mine=1` → siempre `false`.
- `provider/analytics/route.ts:135` cuenta pendientes con los mismos estados inexistentes → siempre 0.
- Del lado proveedor, `cobros.tsx:125` muestra "Cobro finalizado con éxito" cuando no se creó ningún cobro.
Fix: en `aprobar` o `entregar` crear un `ProviderCharge` con `projectId: null` y setear `purchase.chargeId`; alinear `STATUS_META` a los estados reales; o que la UI llame `pagar_mp`/`pagar_efectivo` y la API los acepte desde `aprobado`/`entregado`.

### C3. El stock nunca se descuenta ni se reserva
`StockReservation` tiene 0 usos. `purchases/route.ts:89` solo exige `quantity > 0` (no `>= cantidad pedida`). `aprobar`/`entregar` no tocan `ProviderStock`. El cron `/api/cron/reservations` "vence reservas" que no existen. Dos clientes pueden comprar las últimas 3 unidades a la vez.
Por otro lado, en proyectos, `projects/[id]/materials/route.ts:42-55` **descuenta stock al proponer** (antes de que el cliente apruebe), de **cualquier proveedor** sin vínculo ni consentimiento, puede dejar cantidad negativa, y nunca lo restituye al rechazar/reemplazar (`:110-151`).
Fix: reservar al aprobar con chequeo atómico (`updateMany where quantity >= qty`), consumir al pagar, liberar al rechazar/cancelar/vencer; exigir vínculo activo del proveedor.

### C4. Webhook de Mercado Pago inseguro y no idempotente
`src/app/api/payments/webhook/route.ts`: no valida `x-signature`; `db.payment.create` (`:120`) corre en **cada** notificación (MP reintenta) → filas `Payment` duplicadas; no compara `transactionAmount` con el total; para topics desconocidos llama `getPayment` con un id que no es de pago → 500 → reintentos infinitos. Para compras creadas con el token OAuth del vendedor (`mercadopago.ts:130-132`), el webhook consulta con el token de plataforma → 404 → la compra nunca pasa a `pagado`.
Fix: verificar HMAC, `upsert` por `mpPaymentId` (agregar `@unique`), comparar monto y moneda, ignorar topics que no sean `payment`/`preapproval`, usar el token correcto según el `external_reference`.

### C5. No existe UI para conectar Mercado Pago (OAuth)
`/api/mp/oauth/connect` y `/callback` existen, pero hay **0 referencias** en `src/components`. Sin conexión, `createPurchasePreference` usa el token de HomIA: **el dinero de las ventas entra a la plataforma, no al proveedor**, y `marketplace_fee` sobre preferencia propia es rechazado por MP. Detalles adicionales: el callback no exige sesión (`callback/route.ts:4-70`), guarda tokens en texto plano, `mpOauthRefreshToken` tiene 0 lecturas (el token vence a los 180 días sin aviso), `connect:8` redirige a `/auth/login` (la ruta es `/ingresar`), y el `.env` local no tiene `MP_CLIENT_ID`.

### C6. Máquina de estados de Project sin guardas
`projects/[id]/route.ts:135`: `if (d.status) data.status = d.status` → **cualquier string**. `stage` acepta las 5 etapas en cualquier orden, ida y vuelta, por cualquiera de las dos partes: el cliente puede poner `finalizado` en `presupuesto` sin factura ni pago, o volver de `finalizado` a `presupuesto`. `materialsPaymentMode` puede cambiarse después de facturar en modo `pro_adelanta` → el proveedor emite un cobro por los mismos materiales (**doble cobro**).
En UI, "Finalizar obra" (`cliente/proyecto-detalle.tsx:75-80,179`) es un click sin confirmación, sin `busy` (doble click = doble PATCH), irreversible.

### C7. Contratación directa: el cliente fija el precio y el profesional no puede cotizar ni rechazar
`hire-wizard.tsx:115` manda `laborCost = budgetMax` ("presupuesto estimado, es una referencia" según el copy `:290`). `projects/route.ts:152-165` lo persiste como mano de obra real. No hay endpoint para que el pro edite `laborCost` ni para rechazar la contratación; la factura (`invoice/route.ts:65-80`) usa ese número. El `rubro` elegido en el wizard nunca se envía; `city` se envía y la API la ignora.

### C8. IDORs concretos
- `GET /api/projects/[id]/invoice` (`route.ts:6-20`): solo exige sesión; cualquier usuario lista facturas de cualquier proyecto (ítems, totales, `mpPreferenceId`).
- `PATCH /api/projects/[id]/materials` (`:107`): `findUnique({id: materialId})` sin `projectId: id` → aprobar/rechazar materiales de otro proyecto.
- `POST /api/homy/agent` (`:31-43`): `sessionId` del body sin comprobar dueño → leer y escribir el historial de otro usuario.
- `POST /api/verification/dni` (`:43-47,59`): acepta cualquier URL https (DNI ajeno) y pone `verificationStatus: 'en_revision'` **antes** del dictamen → un POST le saca el badge a un usuario verificado.
- `POST /api/crm/deals` (`:22-37`): `pipelineId` del body sin validar contra la stage.
- `GET /api/jobs/[id]` sin sesión: dirección exacta, lat/lng y fotos del cliente públicas.

### C9. Rate limit en memoria = sin rate limit en Vercel
`src/lib/rate-limit.ts:2-7` es un `Map` por instancia ("el server es un proceso único"). En Vercel cada instancia tiene su Map y muere en cold start. Fuerza bruta de login y registro masivo sin freno. Además `/api/homy` y `/api/homy/agent` aceptan requests **anónimos** sin límite (el agente hace hasta 6 llamadas al LLM por request) → costo abierto.

### C10. El registro ignora `?volver=` y el CTA final de la home no crea cuenta
- `auth-register.tsx`: 0 lecturas de `volver`; `:219` siempre navega al panel. Todos los gates (`app-root`, `profile-gate`, `directory-screen`, `search-screen`, `job-detail`) prometen volver y no vuelven.
- `home/cta-final.tsx:47-53`: "Crear cuenta gratis" muestra un toast "Muy pronto: creación de cuentas".

### C11. Copy que promete funciones inexistentes
12 menciones a sobrantes/reembolsos/retención en `hero.tsx:9,54`, `features.tsx:58-60`, `how-it-works.tsx:28`, `profiles.tsx:17,28-30,43-45`, `ai-band.tsx:20,108-109`, `auth-shell.tsx:19,81`, `layout.tsx:14` (meta description). En backend y schema: 0 implementaciones. La ayuda se contradice sola: `help-screen.tsx:71` "el dinero queda retenido" vs `:104` "va directo al profesional". `profiles.tsx:45` "sin costo de entrada" para el proveedor que paga US$50/mes tras 14 días, y el registro de proveedor **no menciona el trial ni el precio** (0 matches de "prueba", "US$", "trial" en `auth-register.tsx`).

### C12. Panel móvil amputado
`panel-layout.tsx:234`: `filter(i => i.m).slice(0, 5)`. Cliente tiene 6 ítems con `m` → "Mensajes" se corta. Profesional: 8 de 13 secciones sin acceso móvil (Perfil, Verificación, Obras, Presupuestos, Materiales, Cuentas de retiro, Directorio, Ayuda). Proveedor similar. El tour guiado apunta a anclas que en móvil no existen.

### C13. Obras publicadas invisibles en el perfil público
`obras.tsx:98` no envía `professionalId`; `works/route.ts:30-33` lo deja `null`; `profiles/professional/[id]/route.ts:28` filtra por `professionalId`. El toast "¡Obra publicada! Ya aparece en tu perfil" es falso.

### C14. Dos flujos de DNI contradictorios
`perfil.tsx` (profesional `:129-154`, proveedor `:298-352`) sube a `POST /api/profiles/documents`, que crea un `IdentityDocument` "en_revision" **sin IA y sin tocar `verificationStatus`** ("queda en revisión por el equipo de HomIA": nadie revisa). `verificacion.tsx` usa el flujo real. El pill "Verificado" de `perfil.tsx` lee `pro.verified`, campo que **ningún endpoint escribe**. Lo mismo en `search/route.ts:111`, `comparables:48`, `homy-agent.ts:164`: siempre "no verificado".

### C15. Fotos de reseña de compra descartadas en silencio
`reviews/route.ts:54` acepta solo `/uploads/...`; los uploads devuelven URLs de Supabase → las fotos se filtran y el toast dice "publicada". Viola "reseña con foto en TODOS los flujos".

---

## 4. Recorrido por rol

### 4.1 Cliente

**Lo que funciona de punta a punta**: registro → dashboard con checklist real → publicar trabajo → recibir ofertas → aceptar (crea proyecto, cierra job, rechaza el resto) → proyecto con etapas → materiales A/B (aprobar/rechazar) → factura → pagar MP o efectivo → finalizar → reseña 360° → PDF.

**Lo que falla**:
- Facturas (`cliente/facturas.tsx:34-38,148`): se arma desde `/api/projects` cuyo `invoices` solo trae `{id, number, total, status, paymentMethod}` → "Emitida — · mano de obra — + materiales —" y sin nombre de proyecto. El cliente no sabe de qué es cada factura.
- Lista de proyectos (`proyectos.tsx:80-85`) lee `p.pro.user`; `serializeProject` no lo incluye → sin nombre del profesional.
- Trabajo aceptado desaparece de los filtros Abiertas/Cerradas (`trabajos.tsx:74-79` no contempla `en_proceso`) y no tiene link al proyecto creado.
- Notificación "Nuevo presupuesto" linkea `#/panel/cliente/trabajos/:jobId` y `app-root.tsx:177` ignora el sub-segmento.
- Detalle de proyecto: sin tabs (scroll largo), **la descripción del proyecto nunca se muestra**, sin botón de chat (solo tel/mail), rechazar material sin motivo, el modo de pago de materiales lo controla solo el pro aunque la API permite al cliente.
- Copy de dev al cliente: "Agregá MP_ACCESS_TOKEN al archivo .env" (`facturas.tsx:55`, `proyecto-detalle.tsx:89`).
- Pago MP de compras por `window.open` (`materiales.tsx:211`) → bloqueado en móvil; en facturas se usa `location.href`.
- "Reservar" y "Comprar" hacen lo mismo (`materiales.tsx:349-360`; `type:'reserva'` nunca se envía).
- Fallas de red silenciosas en casi todos los fetch (`try/finally` sin `catch`): listados muestran "todavía no tenés nada" cuando en realidad falló.
- Publicar: 12 categorías hardcodeadas (hay 20), presupuesto sin validar min ≤ max, `busy` compartido entre subir fotos y publicar.
- Wizard: promete "pago seguro al finalizar" (escrow inexistente) y "te va a responder por chat" cuando sin mensaje inicial el pro **no puede** iniciar chat.
- Perfil: guarda `displayName` vacío; un PUT por cada tick del slider de radio; sin cambio de contraseña ni recuperación.
- Notificaciones: se marcan todas leídas al abrir; el badge tarda 15 s.
- Favoritos existen pero no hay pantalla ni ítem de nav.
- Triple onboarding apilado al primer login (prompt de verificación + checklist + tour automático que bloquea clicks).

**Notas**: claridad 6 · flujo 4 · feedback 5 · mobile 5 · copy 7 · a11y 6 · consistencia 5.

### 4.2 Profesional

**Lo que funciona**: onboarding real, bolsa con filtros y distancia, ofertar, ser contratado por wizard (notificación), materiales A/B con precio autocompletado de comparables, emitir factura, confirmar cobro en efectivo, verificación DNI, perfil público con reseñas.

**Lo que falla**:
- Crash en proyecto finalizado (`ReviewForm` sin importar).
- Pantalla Materiales es la del cliente (ver §2); tabs expulsan del panel.
- **No existe pantalla de mis ofertas**: `presupuestos.tsx:289` lista proyectos, no `JobBid`. La notificación "Presupuesto rechazado" linkea ahí → dead end. No hay botón "Retirar oferta" (la API lo soporta). Editar oferta no precarga y `bids/route.ts:153` pisa el mensaje anterior con vacío.
- Bolsa: `SelectItem value="todas"` para urgencia (`bolsa.tsx:117`) se envía literal → **0 resultados**. "Limpiar filtros" pone radio 100 (default 25).
- No puede cotizar ni rechazar un proyecto creado por wizard (§3 C7).
- `providerId: 'none'` viaja al POST de materiales (`proyecto-detalle.tsx:424,136`) → viola FK → 500 mudo.
- Select de material carga **1247 filas sin buscador** (`:395-407`), inusable en 390px y viola §8.
- "Emitir factura" se puede pulsar N veces: cada una refactura toda la mano de obra y todos los materiales aprobados (`invoice/route.ts:206,222`); número por `count()+1` → colisión bajo concurrencia.
- No puede descargar el PDF de su propia factura (la API lo autoriza; no hay link).
- Lista de proyectos sin nombre de cliente (`serializeProject` no devuelve `client`).
- Obras invisibles en perfil público (§3 C13); sin editar/eliminar obra; publica igual si falla una foto.
- Cuentas de retiro (`vinculaciones.tsx`): se crean **activas sin consentimiento** del proveedor; pausar una la hace desaparecer para siempre (`provider/links/route.ts:177` filtra `active: true`); no condicionan nada en el sistema (decorativas); el copy de ayuda las describe como cuenta bancaria para cobrar.
- CRM: sin drag & drop pese a `@dnd-kit` instalado; 100% manual, no se alimenta de proyectos ni bids; borrar sin confirmación.
- Dashboard: "Presupuestos enviados" cuenta proyectos, no ofertas; sin estado de error ("Todo al día, campeón" con ceros si falló la red).
- Sin UI para responder reseñas aunque `Review.reply` existe y el perfil lo renderiza.
- Ubicación no editable en perfil; el copy promete filtro por radio que sin coordenadas no aplica.
- Verificar DNI no refresca la sesión → badge desactualizado hasta recargar.
- Copy de Mensajes contradice la regla "cliente inicia" (`messages-screen.tsx:158,178`).

**Notas**: claridad 6 · flujo 4 · feedback 6 · mobile 3 · copy 7 · a11y 6 · consistencia 5.

### 4.3 Proveedor

**Lo que funciona**: plan trial/basic/pro bien modelado (`plans.ts`) con cuenta regresiva y `needsConfig` honesto; cobros de proyectos modo "cliente paga al proveedor" completos (agrupación, un cobro abierto, MP + efectivo, webhook); analítica PRO sobre datos reales (`SearchEvent`, `Purchase`, `ProjectMaterial`) con gating y upsell claro; sponsors en home; combobox difuso y alta con IA anti-duplicado.

**Lo que falla**:
- Dos crashes (`useRef`, `fetchMe`).
- Venta directa sin cobro ni pago ni descuento de stock (§3 C2, C3).
- Sin UI de OAuth MP: **no cobra por MP** (§3 C5).
- Trial vencido: bloquea escritura (403 `needsPlan` correcto) pero **lo sigue mostrando** en marketplace, search, sponsors y le siguen llegando pedidos que no puede aceptar → clientes colgados. `panel-layout` no avisa del plan.
- Registro no informa trial ni precio; onboarding "Completá tu perfil" lee `provider.bio` que no existe (el campo es `description`) → nunca se cumple.
- `perfil.tsx:186-213` tiene un bloque "Plan PRO" legacy con `subscription 'free'|'pro'`: un proveedor Básico ve "Suscribirme al plan PRO" con copy viejo y llama al endpoint legacy.
- "Recomendado" PRO no se renderiza en `marketplace-screen.tsx` (público); solo 3 ofertas sin "ver más"; Comprar/Reservar navegan al panel cliente sin `stockId`; el radio "A 25 km" se envía sin lat/lng → decorativo.
- Perfil: un solo `kind` (no multi-tipo como dice AGENTS §1), sin logo (sponsors usa el avatar), sin horarios, sin geocodificación.
- `SelectItem value="todas"` rompe el filtro de categorías del stock y deja el combobox con 0 elementos (`stock.tsx:275-281,391-399`).
- Stock mínimo y marca no editables tras publicar; `StockMovement` se registra pero no hay UI que lo muestre.
- Aceptar/rechazar pedido con `prompt()` nativo (`cobros.tsx:107-110,323-326`).
- `entregar` retrocede `pagado` → `entregado` (`purchases/[id]/route.ts:114`).
- Cambio de plan no cancela la preapproval anterior → doble cobro mensual en MP (`provider/plan/route.ts:36-58`).
- USD→ARS fijo por env (75.000/150.000) sin cotización ni fecha; se muestra "≈" pero MP cobra el ARS exacto.
- `plan.tsx:64` `window.open` tras `await` → popup-blocker móvil; sin polling ni "ya pagué".
- CRM multi-rol toma `pipelines[0]` (el del profesional) y no se alimenta de compras.
- Tour, guía y onboarding no mencionan "Mi plan".
- Anti-duplicado del catálogo solo dentro de la categoría; toast "con explicación de la IA" aunque la IA haya fallado.

**Notas**: claridad 6 · flujo 3 · feedback 6 · mobile 7 · copy 5 · a11y 6 · consistencia 4 · **valor del plan hoy: 3** (tras arreglar los críticos: 6-7).

### 4.4 Visitante, home, auth y ayuda

- Rutas: 0 rotas. Fetch: 0 a endpoints inexistentes. Anclas del tour: todas existen. 22 videos presentes.
- Home: CTA final muerto (§3 C10); claims falsos (§3 C11); toda la landing hace full reload porque la SPA no está montada en `/` (`router.tsx:34-38`), y `home-screen.tsx` duplica 1:1 a `landing.tsx` (dos homes: `/` y `#/`).
- `hero-search.tsx` (815 líneas): ~330 son coreografía ambiental duplicada desktop/móvil; **auto-envía a la IA a los 20 s sin tipear** (`:262-273`) y borra el input al responder (`:252-253`); intención "materiales" manda al modo profesional del buscador (`:42`).
- Footer: 6 links (`site-footer.tsx:12-18`) hacen `getElementById` → muertos en cualquier página SPA.
- Buscador: para visitantes se renderiza **sin header ni footer** (`app-root.tsx:126-132`), igual que perfiles, trabajo y notificaciones (directorio, materiales y ayuda sí tienen shell). 2 requests por tecla sin debounce (`search-screen.tsx:116-118,165-175`). En 390px ~45% del viewport es cromo.
- Directorio/marketplace/ayuda: doble padding (`pt-20` + `pt-28`) → ~190px en blanco arriba en móvil. Directorio titula "verificados" mientras muestra "No verificado".
- Perfiles públicos: "Volver" hardcodeado a `/buscar` con modo fijo; `provider-profile.tsx:105` filtra con `includes` pelado (viola §8); bloque `!user` inalcanzable (`:226-234`); sin CTA "Pedir" por elemento.
- Registro: checkbox "También quiero contratar" sin efecto (`auth-register.tsx:137-142`); promete "sumar perfiles después" sin UI para hacerlo; contraseña validada recién en el paso 3; acepta PDF para verificación por visión; `setDniFront/Back` sin uso.
- Login: sin "¿Olvidaste tu contraseña?" (no existe endpoint de reset).
- Ayuda: `.homy-btn-ghost` no existe en `globals.css` (0 definiciones, 3 usos) → "Saltar/Anterior/Volver al inicio" son texto suelto. "Ir a la home" del sidebar va a `/buscar`. "Cuenta de retiro" explicada como cuenta bancaria. PRO para profesionales mencionado en tour/howto/videos aunque es legacy. "Comisión solo al facturar" cuando el único fee del backend es 1% en compras. Visitante puede iniciar un tour que navega a rutas gateadas. Tour auto-start a los 900 ms bloqueando toda la UI.
- Dos sistemas de toast conviven (`layout.tsx:57` shadcn + `app-root.tsx:157` sonner). Dos FAB superpuestos en `#/` (HomyWidget + HelpDock).
- SEO: SPA por hash + `ssr:false` → perfiles, directorio y materiales no indexables; sin `og:image`; link compartido muestra OG genérico.

**Notas globales**: jerarquía 8 · copy 5 (rioplatense impecable, pero miente) · design system 7 · mobile 5 · a11y 7 · navegación 5 · performance 6 · **honestidad del producto 4**.

---

## 5. Backend: seguridad, esquema e infraestructura

### Seguridad (además de §3)
- Cron fail-open: `cron/reservations/route.ts:7` solo exige `CRON_SECRET` si está definido (el `.env` local no lo tiene).
- Prisma con `log: ['query']` incondicional (`db.ts:9-11`): en Vercel, cada UPDATE con tokens OAuth, emails y hashes va a los logs.
- OAuth MP: callback sin sesión, tokens en claro, sin refresh, `expires_in` sin validar (`Invalid Date` → 500), `OAuthState` sin limpieza.
- `PUT /api/profiles/me` (`:87-96,111-120`): mass-assignment; crea `ProfessionalProfile`/`ProviderProfile` a quien mande `bio` o `kind` sin tener el rol; acepta `lat: "abc"` (500), `displayName: ""`, `avatarUrl: "javascript:..."`.
- `POST /api/profiles/documents`: endpoint legado sin validación, duplica la verificación (eliminar).
- Registro no transaccional (`register/route.ts:70-129`): valida `businessName` después de crear el `User` y lo borra a mano.
- Uploads: bucket único público (DNI en URL permanente sin auth), MIME confiado del cliente, PDF permitido, sin cuota por usuario; la CSP de `/uploads/*` en `next.config.ts` ya no protege nada (los archivos viven en supabase.co). Sin `X-Frame-Options`/`frame-ancestors`.
- JWT de 30 días sin revocación (`auth.ts:22`); `getSessionUser` devuelve `null` ante caída de DB (todos ven 401 en vez de 503).
- `notification_url`/`back_urls` derivadas del `Host` del request en 6 rutas → manipulables; en previews de Vercel apuntan a URL protegida.
- `sec-audit.sh` (29 checks): no cubre webhook, OAuth, cron, mass-assignment, DNI ajeno, CSRF ni cabeceras; el check de path traversal ya no puede fallar (uploads en Supabase); el de rate-limit solo vale en un proceso local. El "29/29" de AGENTS §11 no prueba lo que dice.
- `.env` local: faltan `MP_ACCESS_TOKEN`, `MP_CLIENT_ID/SECRET`, `AI_API_KEY`, `CRON_SECRET` (hay `ACCESS_TOKEN`/`CLIENT_ID` con otros nombres); mezcla `VERCEL_TOKEN` y `GITHUB_PERSONAL_ACCESS_TOKEN` con secretos de app. No hay `.env.example` aunque AGENTS lo menciona.

### Esquema (`prisma/schema.prisma`)
- Dinero en `Float` (`price`, `amount`, `total`, `laborCost`…) con `Math.round(x*100)/100` disperso.
- ~10 FKs faltantes: `Invoice.clientId/professionalId`, `Favorite.targetUserId`, `StockReservation.userId/projectId`, `CompletedWork.professionalId/jobId`, `Review.projectId/workId/purchaseId`, `Purchase.stockId/elementId/chargeId`, `CrmDeal.jobId/projectId`, `SearchEvent.userId`.
- Índices: solo `@@index([conversationId, createdAt])`. Prisma no indexa FKs en Postgres. Faltan en `Notification(userId, read)`, `Review(targetUserId)`, `Purchase(providerId, status)`, `Project(clientId)`, `Project(professionalId)`, `ProviderStock(elementId)`, `JobPost(status, categorySlug)`, etc. Con pooler `connection_limit=1` cada seq scan bloquea más.
- Enums como String sin validar y con valores inconsistentes: `pagado` vs `pagada`, `jardin`/`jardineria`/`material`, `Project.status` y `stage` ambos con `finalizado`, `Invoice.status='vencida'` nunca se setea.
- Desnormalización sin dueño: `rating/reviewsCount` ×3, `lat/lng/city` ×3, `verified` ×2 + `verificationStatus`. Perfil público calcula rating y `reviewsCount` sobre `take: 20` → números distintos entre directorio y perfil. El rating mezcla reseñas recibidas como cliente, pro y proveedor.
- Unicidad de reseña solo a nivel app (race → duplicados). `Payment.mpPaymentId` sin `@unique`.
- Sin `prisma/migrations`; `db:push --accept-data-loss` como script; `supabase/migrations/` desincronizado (no conoce `OAuthState` ni `mpOauth*`). El header del schema dice "SQLite".
- JSON-as-string parseado sin try/catch en 6 rutas (existe `parseJson()` en `api.ts:40` y no se usa).

### Performance
- `directory`, `search`, `comparables`, `pins`, `homy-agent` cargan **todas** las filas (pros, proveedores, stock completo) en memoria por request público, sin paginación ni cache.
- `directory`, `search`, `pins`, `comparables`, `jobs`, `provider/stock`, `provider-profile` usan `String.includes` (viola §8/§10.5; solo marketplace y el agente usan `search-match.ts`).
- `jobs/route.ts:40-54`: `take: 60` **antes** de `withinRadius`. `marketplace/route.ts:130-149`: el radio calcula distancia pero **no filtra**.
- `SearchEvent` se inserta en cada request del marketplace (anónimos, cada tecla) sin límite.
- `messages/conversations/[id]`: `orderBy asc, take 300` → en hilos largos nunca se ven los últimos mensajes. `homy/agent`: `take: 10` ascendente → los primeros 10, no los últimos.
- `search-match.ts` no es "difuso" (es `includes` + strip de `s` final, sin tolerancia a typos); `canonicalCategoria` matchea `"a"` → `plomeria`; `ferreteria → herreria` es incorrecto.
- `geo.ts:22,27-29`: `withinRadius` incluye a todos los que no tienen coordenadas; `!centerLat` trata 0 como ausente.
- Landing entera con framer-motion; `@mdxeditor/editor`, `next-auth`, `next-intl`, `react-syntax-highlighter`, `sharp`, `bun-types` sin uso.
- `/api/auth/me` se repite en cada montaje de pantalla.

### IA
- `ai.ts` es un shim limpio; fallback honesto real en los 4 call-sites.
- Pero: sin `maxDuration` (DNI con 2 imágenes y agente con 6 iteraciones exceden el default); `homy` y `homy/agent` sin auth ni rate limit; el fallback heurístico del agente es código muerto (`ZAI.create()` nunca lanza; `homy-agent.ts:354-404` inalcanzable); `dni-ai.ts` verifica posesión de fotos, no identidad (no coteja nombre/DNI con `displayName`/`dniCuil`, `mismoTitular` asume "sí" si el modelo omite el campo); `MODEL='glm-4.5v'` es const muerta; `homy/route.ts:96-101` acepta turnos `homy` en el historial del cliente (spoof de contexto).

---

## 6. Máquinas de estado reconstruidas (con huecos)

| Entidad | Transiciones reales | Huecos |
|---|---|---|
| **JobPost** | `abierto` →(aceptar bid) `en_proceso`; dueño PATCH a `cerrado/cancelado/abierto` desde cualquier estado | `en_proceso→abierto` reabre con proyecto activo; nada pasa a `cerrado` al finalizar; `cancelado` no toca bids ni proyecto |
| **JobBid** | `pendiente` → `aceptado`/`rechazado`/`retirado`; `rechazado` → `pendiente` (re-oferta) | `retirado` es terminal aunque re-oferte; `aceptado→retirado` y `retirado→aceptado` permitidos; sin transacción al aceptar |
| **Project** | `status` texto libre; `stage` 5 valores en cualquier orden por cualquier parte | Sin `pendiente_aceptacion` del pro, sin `cancelado` con efectos, sin bloqueo desde `finalizado`, sin bloqueo de cambio de modo tras factura |
| **ProjectMaterial** | `propuesto` → `aprobado`/`rechazado`/`reemplazado` | Stock descontado al crear y nunca liberado; `aprobado→rechazado` recalcula costo sin ajustar facturas emitidas |
| **Invoice** | `pendiente` → `pagada` (webhook o efectivo confirmado) | `vencida` nunca; sin anulación; múltiples facturas activas por proyecto; MP después de efectivo confirmado sin conciliación |
| **Payment** | fila nueva por cada notificación MP | Duplicados; sin `@unique` |
| **Purchase** | `pendiente_aprobacion` → `aprobado`/`rechazado`/`cancelado`; cliente `pagar_efectivo` → `entregado` (salta al proveedor); `aprobado` → `entregado`; webhook → `pagado`; `pagado` → `entregado` (regresión) | `entregado` es terminal de facto (sin `chargeId`); cliente puede pagar antes de aprobación; `pagar_mp` con total 0 explota; sin `vencida`, `en_disputa`, reembolso |
| **ProviderCharge** | `pendiente` → `acordada_efectivo` → `pagada`; `pendiente` → `pagada` (webhook) | Sin anular; sin volver a MP; charges de venta directa definidos pero nunca creados |
| **StockReservation** | — | **Cero transiciones, cero usos** |
| **ProviderProfile.subscription** | `trial` →(webhook) `basic`/`pro` →(cancelled/paused) `trial` con `trialEndsAt=epoch` | `basic↔pro` sin cancelar preapproval anterior; sin reconciliación con MP; vencido sigue listado y recibiendo pedidos |

---

## 7. Mismatches frontend ↔ API (consolidado)

| Front | Espera / envía | API | Efecto |
|---|---|---|---|
| `cliente/facturas.tsx:24` | `issuedAt, laborCost, materialsCost, project.title` | `projects/route.ts:16` solo 5 campos | Facturas con "—" y sin proyecto |
| `cliente/proyectos.tsx:80` | `p.pro.user.displayName` | `serializeProject` sin `pro` | Sin nombre del profesional |
| `profesional/proyectos.tsx:87` | `p.client` | `serializeProject` sin `client` | "Cliente: —" |
| `cliente/materiales.tsx:53-59` | `solicitado/aceptado` | `pendiente_aprobacion/aprobado/rechazado` | Labels falsos, sin cancelar, sin pagar |
| `cliente/materiales.tsx:607`, `cobros.tsx:355` | `purchase.chargeId` | Nadie lo escribe | Pago inalcanzable; "(sin cobro)" |
| `cliente/materiales.tsx:199` | `POST /api/charges/:chargeId` | API expone `PATCH /purchases/:id {pagar_mp}` desde `aprobado` | Flujo incompatible |
| `cliente/materiales.tsx:349-360` | "Reservar" sin `type` | `type:'reserva'` soportado | Reservar = Comprar |
| `cliente/materiales.tsx:223` | `/api/reviews?purchaseId=` como "mías" | Sin `mine=1` filtra por target | `hasReseña` siempre false |
| `cliente/materiales.tsx:241`, `app-root.tsx:188` | `user.role`, prop `role` | Sesión expone `roles[]`; componente sin props | Comparables nunca; pro expulsado |
| `review-form.tsx:416` | fotos `https://supabase…` | `reviews/route.ts:54` solo `/uploads/` | Fotos descartadas |
| `hire-wizard.tsx:53,111-122` | envía `city`, `laborCost=budgetMax`; no envía `rubro` | Ignora `city`; persiste `laborCost` | Precio fijado por cliente; rubro perdido |
| `profesional/bolsa.tsx:117` | `urgency='todas'` | `where urgency` literal | 0 resultados |
| `proveedor/stock.tsx:277,395` | `cat='todas'` | filtro espera `''` | Lista y combobox vacíos |
| `proyecto-detalle.tsx:424,136` | `providerId:'none'` | FK a `ProviderProfile` | 500 mudo |
| `obras.tsx:98` | sin `professionalId` | `works/route.ts:30-33` lo deja null | Obras invisibles en perfil |
| `perfil.tsx` (pro/prov) | `pro.verified` / `provider.bio` / `subscription 'free'` | Nunca se escribe / no existe (`description`) / es `trial|basic|pro` | Pill incorrecto; onboarding nunca hecho; Básico como "free" |
| `perfil.tsx:144` | `POST /api/profiles/documents` | Sin IA, sin cambiar estado | Flujo muerto, toast falso |
| `presupuestos.tsx:289` | proyectos | notif de bid rechazado linkea acá | No lista `JobBid` |
| `job-detail.tsx:73` | `message:''` al editar | `bids/route.ts:153` usa `??` | Pisa mensaje previo |
| `vinculaciones.tsx:301` | toggle `active:false` | GET filtra `active:true` | Link desaparece |
| `analytics/route.ts:135` | — | estados `solicitado/aceptado` inexistentes | `pendientes` = 0 |
| `marketplace-screen.tsx:52-58,82-90` | radio sin lat/lng; Comprar sin `stockId` | requiere centro; requiere stock | Radio decorativo; CTA sin efecto |
| `marketplace-screen.tsx:167` | `EmptyState icon={Package} desc=` | espera `icon` ReactNode y `hint` | Ícono roto |
| `mp/oauth/connect:8` | redirect `/auth/login` | ruta es `/ingresar` | 404 |
| Notifs `#/panel` (reviews:179), `#/panel/cliente/trabajos/:id` (bids:110) | — | `RolePicker`; sub ignorado | Dead ends |
| `auth-register.tsx` | — | 9 gates envían `?volver=` | Retorno perdido |

---

## 8. Lo que está bien (para no tocarlo al arreglar el resto)

- Auth: bcrypt + JWT `jose` + cookie httpOnly/Lax/Secure-auto + `AUTH_SECRET` fail-fast. `ok()/fail()` con `no-store`.
- Ownership de las partes consistente en proyecto/factura/cobro/compra/conversación/CRM/notificaciones/favoritos.
- Reseñas 360°: participantes reales, obra finalizada, target por rol, unicidad, recálculo de rating, notificación, formulario compartido con estrellas + comentario + 4 fotos.
- Regla "el cliente inicia" implementada server-side y reflejada en perfiles (`chatBlocked`).
- Pago dual MP/efectivo en facturas y cobros con acuerdo bilateral, confirmación del cobrador y cancelación.
- Gating de plan del proveedor en todas las escrituras con `needsPlan/needsPro` para UI honesta; `plans.ts` centralizado.
- Analítica PRO sobre datos reales; sponsors se ocultan si no hay PRO.
- Catálogo con IA: zod in/out, anti-duplicado, fallback honesto. Combobox difuso del stock con `search-match.ts`.
- Homy: zod, tools solo lectura, datos reales inyectados, fallback predefinido, `MAX_ITERATIONS`.
- Design system `homy-*` aplicado con disciplina; app-shell 100dvh con único scroller; `AutoFitValue`/`homy-num-adapt` para cifras; role switcher accesible; tour por teclado; onboarding con progreso real; empty states con CTA.
- 0 rutas rotas, 0 fetch a endpoints inexistentes, 0 `console.log`, 0 TODO, 22 videos presentes, copy rioplatense consistente (voseo sin tuteo).

---

## 9. Plan de acción recomendado

### Fase 0 — Hoy (bloquea el deploy)
1. Corregir los 6 errores de TypeScript y los 2 de ESLint. Poner `ignoreBuildErrors: false` y `noImplicitAny: true`.
2. `dni-ai.ts`: leer imágenes por `fetch` desde Supabase (validando carpeta del usuario). Bucket privado + signed URL para DNI.
3. Webhook MP: firma HMAC, `upsert` por `mpPaymentId`, comparar monto, ignorar topics no soportados, token correcto por `external_reference`.
4. `maxDuration = 60` en `homy`, `homy/agent`, `verification/dni`, `catalog`, `payments/webhook`.
5. `db.ts`: logs de query solo en dev. `CRON_SECRET` obligatorio. `APP_URL` en env para `notification_url`/`back_urls`.
6. Rate limit distribuido (Upstash o Vercel WAF) en `/api/auth/*`, `/api/homy*`, `/api/uploads`.

### Fase 1 — Cerrar el flujo de dinero (1-2 semanas)
7. Compra directa: al `aprobar`/`entregar` crear `ProviderCharge` y setear `chargeId`; alinear estados en `materiales.tsx`, `cobros.tsx` y `analytics`; reseña alcanzable; fotos de reseña con la misma regex que proyectos.
8. Stock: reservar al aprobar (atómico), consumir al pagar, liberar al rechazar/cancelar/vencer; en proyectos reservar al aprobar, no al proponer; exigir vínculo del proveedor.
9. UI de OAuth MP en Cobros del proveedor (conectar, estado, desconectar); bloquear `pagar_mp` sin conexión con 503 honesto; refresh de token; cifrar tokens.
10. Máquina de estados de Project: whitelist de `status`, tabla de transiciones, `pendiente_aceptacion` con cotización del pro (PATCH `laborCost` solo en presupuesto) y rechazo; bloquear cambio de modo tras factura; confirmación en "Finalizar obra".
11. Facturas: una abierta por proyecto, materiales facturados una sola vez, numeración por secuencia; PDF accesible para el pro. Cambio de plan cancela la preapproval anterior. Trial vencido fuera de marketplace/sponsors y sin pedidos nuevos.
12. IDORs: `GET projects/[id]/invoice`, `PATCH materials`, `homy/agent sessionId`, `verification/dni` (prefijo de carpeta, no degradar badge antes del dictamen), `crm/deals pipelineId`, `jobs/[id]` sin sesión.
13. `$transaction` en registro, aceptar bid, aprobar compra, emitir factura, webhook.

### Fase 2 — Contratos y honestidad (1 semana)
14. Serializers: `projects` devuelve `client`, `pro`, `invoices` completos. Pantalla "Mis ofertas" con `GET /api/bids?mine=1`, estado y retirar. Obras con `professionalId` automático. `works` con editar/eliminar.
15. Registro respeta `?volver=`; CTA final de la home crea cuenta; registro de proveedor informa trial y precio; quitar checkbox sin efecto.
16. Reescribir copy: sin escrow, sin sobrantes/reembolsos, sin visitas IA, sin pre-pago, sin "sin costo de entrada"; ayuda sin "cuenta bancaria", sin PRO profesional, comisión real. Eliminar `profiles/documents`, el bloque Plan PRO legacy y el bloque DNI de `perfil.tsx`; leer `user.verificationStatus` en todos lados.
17. `SelectItem value="todas"` → `''` en bolsa y stock. `providerId:'none'` → `''`. Combobox difuso en materiales de proyecto (1247 ítems). Una sola fuente de categorías (20).
18. Manejo de errores de red en todos los fetch (toast + estado de error con reintentar). Reemplazar `prompt()`/`confirm()` nativos por diálogos del design system. Un solo toaster. `location.href` para MP en todos lados.

### Fase 3 — Mobile y UX (1 semana)
19. Bottom nav con ítem "Más" (sheet con el resto) para los 3 roles; Mensajes visible para el cliente. Tour móvil con anclas reales; tour no automático (ofrecerlo desde el checklist).
20. Shell público (header/footer) en buscar, perfiles, trabajo, notificaciones. Doble padding en directorio/materiales/ayuda. Debounce en el buscador. `.homy-btn-ghost` definido. Footer con links reales en SPA. "Ir a la home" → `/`. "Volver" con `history.back()`.
21. Detalle de proyecto con tabs, descripción visible, botón de chat, motivo al rechazar material, cliente con control del modo de pago. Favoritos con pantalla. Responder reseñas. Cuentas de retiro con consentimiento bilateral y sin borrado al pausar.
22. Marketplace público: "Recomendado" PRO, "ver N más", Comprar con `stockId` real, radio con `useLocation`.

### Fase 4 — Deuda técnica (continua)
23. Capa `parseBody(req, zodSchema)` y migrar las 52 rutas; enums centralizados (`z.enum` o enums nativos de PG).
24. `Decimal` para dinero; FKs e índices faltantes; `@unique` en `Payment.mpPaymentId` y reseñas; `prisma migrate` versionado; retirar `--accept-data-loss` y `supabase/migrations` desincronizadas.
25. Paginación y `where` en SQL para directorio/search/comparables/pins; `search-match.ts` en todos los buscadores; mejorar la similitud real (typos).
26. Rating por rol; una sola fuente para `lat/lng/city` y `verified`. Reconciliación periódica de preapprovals MP. `tokenVersion` en JWT; cambio y recuperación de contraseña; baja de cuenta.
27. Reducir `hero-search.tsx` (extraer demo ambiental, reutilizar cards), montar la SPA en `/` (una sola home), desinstalar deps sin uso, `frame-ancestors`, observabilidad (request-id, Sentry).
28. Actualizar AGENTS.md: Postgres (no SQLite), 56 endpoints, zod real, `sec-audit` con lo que realmente cubre, `.env.example` con los nombres correctos (`MP_ACCESS_TOKEN`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `AI_*`, `CRON_SECRET`, `SUPABASE_*`, `APP_URL`).
