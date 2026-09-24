# Documentación de HomIA

Esta carpeta explica **qué hace HomIA y cómo está hecho**. Sigue la estructura del PLAYBOOK
(§9.1) y la **regla de los tres documentos** de Leonardo (24/09/2026): cada modificación y cada
decisión se registra en el documento funcional, en el de lógica y en el técnico, cada uno con su
fin. Nada queda sin registrar.

## Qué leer para qué

| Si querés… | Leé | Para quién |
|---|---|---|
| Saber cómo se usa HomIA por rol (visitante, cliente, profesional, proveedor), paso a paso | [`compartible/estandarizada/FUNCIONAL-HOMIA.md`](./compartible/estandarizada/FUNCIONAL-HOMIA.md) | Dueño, guías de uso |
| Conocer las reglas de negocio: quién puede qué, estados, montos, comisión, planes, endpoint por endpoint | [`interno/LOGICA-HOMIA.md`](./interno/LOGICA-HOMIA.md) | Agentes y desarrolladores |
| Entender la ingeniería: stack, arquitectura, datos, integraciones, variables, seguridad, pruebas, deploy, trampas | [`interno/TECNICO-HOMIA.md`](./interno/TECNICO-HOMIA.md) | Agentes y desarrolladores |
| Ver por qué se decidió algo, cuándo y quién | [`interno/decisiones.md`](./interno/decisiones.md) | Todos |
| Retomar el trabajo donde quedó (primera lectura de cada sesión) | [`interno/bitacora-sesiones.md`](./interno/bitacora-sesiones.md) | Agentes |
| La auditoría del 23/09 y el plan de 48 h | [`AUDITORIA-INTEGRAL.md`](./AUDITORIA-INTEGRAL.md), [`PLAN-LANZAMIENTO-48H.md`](./PLAN-LANZAMIENTO-48H.md) | Referencia (fechados) |
| La guía original de migración a Vercel | [`DEPLOY-VERCEL.md`](./DEPLOY-VERCEL.md) | Histórico: varias instrucciones ya no aplican (ver `TECNICO-HOMIA.md` §10) |
| Documentos viejos del sandbox | [`historico/`](./historico/) | Solo consulta; pueden estar desactualizados |

## Estructura

```
docs/
├── README.md                          → este archivo
├── interno/                           → técnico, va al repo, NO para clientes
│   ├── TECNICO-HOMIA.md               → arquitectura e ingeniería (basado en el código)
│   ├── LOGICA-HOMIA.md                → lógica de negocio, endpoint por endpoint
│   ├── decisiones.md                  → registro de decisiones de producto
│   └── bitacora-sesiones.md           → memoria de trabajo del agente (se lee primero)
├── compartible/
│   └── estandarizada/
│       └── FUNCIONAL-HOMIA.md         → guía de uso por rol, sin jerga
├── AUDITORIA-INTEGRAL.md              → auditoría fechada (23/09/2026)
├── PLAN-LANZAMIENTO-48H.md            → plan fechado (23/09/2026)
├── DEPLOY-VERCEL.md                   → guía histórica de migración
└── historico/                         → documentos del sandbox (solo consulta)
```

Carpetas del PLAYBOOK que todavía no existen y se crean cuando haga falta:
`interno/backups/`, `compartible/particular/<cliente>/`, `superpowers/specs/` y `superpowers/plans/`.

## Cómo se mantiene

1. Cada cambio de código o decisión de producto actualiza, **en la misma rama y antes de pedir el OK
   de merge**, los tres documentos: funcional (qué ve y hace cada rol), lógica (reglas y endpoints) y
   técnico (ingeniería). Si alguno no se ve afectado, se dice explícitamente en el pedido de OK.
2. Las decisiones de producto van además a `interno/decisiones.md`, con fecha, quién decidió y por qué.
3. Una entrada en `interno/bitacora-sesiones.md` remite a lo actualizado.
4. Todo sale **del código**, nunca de memoria ni de documentos viejos, y cada afirmación importante
   lleva su fuente (`archivo:línea` o endpoint).
5. Lo que está a medio construir se marca **EN CONSTRUCCIÓN** con la rama y lo decidido.

## `AGENTS.md` y el código

El 24/09/2026 se reescribió `AGENTS.md` (misma estructura, §1–§12) para que coincida con el código
del commit `2eed864`: se corrigieron las ~20 diferencias que había contra el código (router
`.tsx`, cantidad de endpoints, migraciones y modelos, SQLite → Postgres, herramientas de Homy,
regla del chat por destinatario, CSP real, qué rutas usan zod, modo A/B elegido por el profesional,
`/invoices/[id]`, cancelación de la suscripción anterior recién al autorizar la nueva,
`/cron/subscriptions`, `/profiles/documents` inexistente, endpoints faltantes, firma del webhook no
bloqueante, perfiles que exigen sesión, texto del botón de Mercado Pago, estado al 24/09) y se sumó
lo nuevo (carrito y pedidos, cargo de servicio 1%, cobro a la cuenta del vendedor, súper agente
Homy con cupo, sobrantes con confirmación y recordatorio de 72 h, 404 JSON en `/api`).

Deuda que `AGENTS.md` deja anotada en vez de esconder: rutas que todavía no validan con zod (§4) y
búsquedas que usan `includes` en lugar de `search-match.ts` (§8).
