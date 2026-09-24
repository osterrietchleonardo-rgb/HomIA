# HomIA — Registro de decisiones de producto

> **Cómo se usa:** una fila por decisión, la más nueva arriba dentro de cada fecha. Cada decisión
> dice **qué** se decidió, **quién**, **por qué** y **dónde impacta**. Si una decisión reemplaza a
> otra, se marca la vieja como "Reemplazada por…" en vez de borrarla. Toda decisión nueva se refleja
> además en los tres documentos (funcional, lógica, técnico) — ver `docs/README.md`.
>
> Fechas verificadas en `git log` y en `docs/PLAN-LANZAMIENTO-48H.md` §0 (23/09/2026) o, cuando no
> hay rastro en el repo, con la fecha que registró Leonardo (23 o 24/09/2026).

| # | Fecha | Decisión | Quién | Por qué | Dónde impacta | Estado en el código |
|---|---|---|---|---|---|---|
| D13 | 2026-09-24 | **"El cliente inicia" se decide por el destinatario:** una conversación nueva solo se abre hacia quien ofrece algo (profesional o proveedor); a un usuario que solo es cliente nadie le escribe primero. Los perfiles públicos de profesionales y proveedores siempre se pueden contactar | Claude (aplicando la regla ya definida por Leonardo en AGENTS.md) | Todo registro recibe rol cliente, así que el chequeo por roles de quien escribe nunca frenaba a nadie | `src/app/api/messages/conversations/route.ts`, `profiles/professional/[id]`, `profiles/provider/[id]` | Implementada en `feat/carrito-homy` |
| D12 | 2026-09-24 | **Regla de los tres documentos:** toda modificación y toda decisión se registra en el documento funcional, el de lógica y el técnico, en la misma rama y antes de mergear; más una línea en la bitácora | Leonardo | Él no lee código: los documentos son su forma de saber qué hace el sistema y la fuente para cualquier agente que continúe. Un cambio sin registrar se pierde | `docs/` completo | Aplicada desde esta rama (`docs/README.md`) |
| D11 | 2026-09-24 | **Una sola base, sin staging:** local, Preview y Producción usan el mismo Supabase | Leonardo | Recursos limitados; se acepta el riesgo con disciplina (todo lo que escribe necesita OK, pruebas con cuentas demo y purga) | Scripts, E2E, migraciones | Vigente (`TECNICO-HOMIA.md` §5) |
| D10 | 2026-09-24 | **Homy nuevo con el modelo `gpt-5.6-luna`** | Leonardo | Súper agente mejor para el lanzamiento | `src/lib/homy/openai.ts` (`HOMY_MODEL`, Responses API; razonamiento `low`, medido contra `medium`) | Implementada en `2eed864` (rama `feat/carrito-homy`). DNI y catálogo siguen con `AI_MODEL=gpt-5.4-mini` |
| D9 | 2026-09-24 | **Cupos de IA:** 8 consultas por día por IP para visitantes y 60 por día por usuario logueado | Leonardo | Abrir Homy a visitantes sin que el gasto de IA se descontrole | `/api/homy/agent`, `src/lib/homy/cupo.ts` (tabla `AiUsage`) | Implementada en `2eed864`: cupo en la base, compartido home + flotante, descontado antes de llamar al modelo y devuelto si la IA falla; además tope global de visitantes `HOMY_TOPE_DIARIO_VISITANTES` (3000) y kill-switch `HOMY_APAGADO` |
| D8 | 2026-09-24 | **Carrito para clientes, profesionales y visitantes**, con pedidos a varios proveedores en una sola compra (un sub-pedido por proveedor) | Leonardo | Comprar varios materiales de una vez; que el visitante pueda armar el carrito antes de registrarse | Materiales, compras, cobros del proveedor | Implementada en `2eed864`: carrito del visitante en el navegador que se fusiona al ingresar; `Order` con un sub-pedido por proveedor; Comprar (7 días) o Reservar (48 h) por proveedor; pago de a uno; línea de tiempo |
| D7 | 2026-09-24 | **El dinero va a la cuenta de Mercado Pago del vendedor** (proveedor o profesional), en compras, facturas y cobros | Leonardo | Que cada vendedor cobre directo y HomIA no tenga plata de terceros | `src/lib/mercadopago.ts`, OAuth del vendedor | Implementada en `2eed864` (`createSellerPreference`): compras y cobros → proveedor, facturas → profesional (nueva tarjeta "Cobrá con tu Mercado Pago" en su perfil). Sin OAuth del vendedor, solo efectivo |
| D6 | 2026-09-24 | **El 1% lo paga el cliente, solo si paga con Mercado Pago**, como "Cargo de servicio HomIA (1%)" sumado a su total, en compras y en proyectos (facturas y cobros de materiales). El vendedor cobra el 100%. En efectivo no hay cargo | Leonardo | Transparencia para el vendedor y un ingreso de la plataforma ligado al uso del pago online | Compras, facturas, cobros, textos de ayuda | Implementada en `2eed864` (`src/lib/fees.ts`): 1% del subtotal de cada proveedor o factura, redondeado a 2 decimales, como `marketplace_fee`; no se reembolsa en sobrantes. **Reemplaza a D5** |
| D5 | 2026-09-23 | Comisión del 1% en compras directas por MP, **descontada al proveedor** como `marketplace_fee` ("split 1%"); facturas sin comisión | Leonardo (plan de lanzamiento) | Primer modelo de ingreso por uso | `purchases/[id]/route.ts:139` | **Reemplazada por D6** (pagos anteriores quedan con la regla vieja) |
| D4 | 2026-09-23 | **Precios de los planes del proveedor en pesos:** Básico $50.000/mes, PRO $100.000/mes, prueba 14 días. Se abandona el precio en dólares. Solo los proveedores pagan | Leonardo | Cobrar en la moneda local por Mercado Pago | `src/lib/plans.ts`, `MP_PROVIDER_*_ARS` | Implementada (commit `288f9a0`) |
| D3 | 2026-09-23 | **Sobrantes:** el cliente o el profesional devuelven materiales pagados al proveedor (hasta 30 días, con foto); el proveedor acepta todo, parte o rechaza; al recibir, **reembolso por Mercado Pago** si se pagó por MP o **en efectivo** en el mostrador | Leonardo | Diferencial del producto y confianza del cliente | `returns/*`, `src/lib/leftovers.ts` | Implementada (commit `288f9a0`); en `2eed864` se sumaron la confirmación del reembolso en efectivo por el solicitante (o automática a las 72 h) y un recordatorio único al proveedor a las 72 h |
| D2 | 2026-09-23 | **Visitas agendadas por IA: fuera** por ahora; se elimina el copy | Leonardo | No existían en el código; no prometer lo que no hay | Textos de la home y ayuda | Aplicada (commit `288f9a0`) |
| D1 | 2026-09-23 | **Escrow / retención de pago: fuera.** El pago va directo (Mercado Pago o efectivo), al finalizar la obra o al retirar | Leonardo | Simplicidad y honestidad: el código no retenía nada | Textos, migración `0012` queda como histórico | Aplicada (commits `288f9a0`, `1a92f9c`) |

## Pendientes de decidir (hallazgos anotados, no son propuestas)

- **Reembolso de sobrantes de materiales facturados por el profesional (modo A) y pagados por
  Mercado Pago** (anotado el 24/09/2026): hoy se reembolsa **desde la cuenta del profesional**
  (quien cobró la factura), aunque los sobrantes los recibe el proveedor. Si el profesional no tiene
  Mercado Pago conectado, el reembolso falla con "El profesional que cobró la factura no tiene
  Mercado Pago conectado…". Falta decidir quién devuelve la plata en ese caso y cómo se compensa
  entre profesional y proveedor. Fuente: `src/app/api/returns/[id]/route.ts` (`doRefund`).

- Textos de ayuda y tour que prometen cosas distintas de lo que hace el código
  (`FUNCIONAL-HOMIA.md` §5).
