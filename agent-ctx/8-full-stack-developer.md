# Task ID: 8 — Lote E — full-stack-developer

## Rediseño visual del PANEL PROVEEDOR (5 pantallas) — HomIA

**Archivos tocados (solo capa visual, lógica/API/datos intactos):**
- `src/components/screens/panel/proveedor/dashboard.tsx`
- `src/components/screens/panel/proveedor/stock.tsx`
- `src/components/screens/panel/proveedor/crm.tsx`
- `src/components/screens/panel/proveedor/vinculaciones.tsx`
- `src/components/screens/panel/proveedor/perfil.tsx`

## Decisiones y convenciones

- Convergencia con Lote D (panel profesional): mismo vocabulario de página — `.homy-page` + `.homy-page-head` (eyebrow + `homy-page-title mt-1.5` + `homy-page-sub` + CTA derecha `min-h-[44px]`) + `.homy-stagger` en KPIs/listas/grid + `homy-section-head/homy-section-title` con icon-chips + `.homy-row` para filas clickeables + componentes locales `Kpi`/`QuickLink`/`Empty` con la misma firma que el lote profesional.
- Regla de oro respetada: cero datos inventados. El dashboard pedía "pedidos del día / facturación" pero no existe fuente de datos → se mantuvieron los 4 KPIs reales (Elementos publicados, Valor del stock = money KPI, Por agotar, Agotados) con `.homy-kpi` + `--kpi-glow` (#00C4FF / #FFC700 / #FF5A1F / #DC2626). En CRM no hay lista de profesionales (el endpoint solo trae pipeline+deals): pipeline como columnas de vidrio (`homy-glass-soft` contenedor + tarjetas `homy-glass`), deals con avatar de contraparte.
- Solución a conflicto Tailwind v4 + CSS unlayered: `border-*`/`ring-*` utilities PIERDEN contra `.homy-glass`/`.homy-glass-soft` (mismo problema documentado por lote 11-b). Empty states con `.homy-empty` sobre div plano con borde dashed (utilities aplican al no haber clase glass en el mismo elemento). Chips rojos de estado crítico con `style` inline (linear-gradient #fee2e2→#fecaca) porque no existe chip tone rojo.
- KPI horizontal (chip izquierda, label/value/hint derecha) con `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` y `[overflow-wrap:anywhere]` en el valor: evita clipping de `formatARS(stockValue)` que el layout vertical 2-col mobile recortaría (`.homy-kpi` tiene overflow:hidden).
- Botones ≥44px: CTA `min-h-[44px]`, submit de dialogs `min-h-[48px]`, steppers +/− y guardar-precio `size-11`, botones mover-trato CRM `size-11`, tabs de estado `min-h-[40px]` (pills compactas), eliminar producto `min-h-[44px]`.
- Stock: filtro de estado convertido de `<select>` a `.homy-tab` con `aria-pressed` + contadores reales por estado (mismo estado `statusF`, mismos valores); categoría sigue en select (dinámica, 139 elementos). Precio como input grande tabular (`text-lg font-extrabold text-right tabular-nums`). Se eliminó `rowTone()` local (quedó sin uso tras abandonar fondos rojo/ámbar por badges + pill de estado, regla 60-30-10).
- Vinculaciones: banda explicativa ahora `.homy-glass-dark` con glow cian decorativo (pointer-events-none + aria-hidden) y microcopy del beneficio indicado por el task ("los sobrantes se reembolsan automáticamente") también en el empty state.
- Perfil: tarjeta de identidad con UAvatar 64 + nombre + email + estrellas + pill CUIT `font-mono` (dato real) + form con labels `text-[13px] font-bold`, CUIT con `font-mono tabular-nums` (prop `mono` agregada a `Field`), guardar con `.homy-btn-primary` (antes dark).
- Accesibilidad: ids+htmlFor en todos los inputs de dialogs/forms, aria-labels conservados, `role="group"` + aria-label en grupo de tabs, decoraciones con aria-hidden + pointer-events-none, animaciones solo clases existentes del sistema (todas cubiertas por prefers-reduced-motion).

## Verificación

- `npx eslint <5 archivos>` → 0 errores.
- `npx tsc --noEmit` → 17 errores totales, TODOS pre-existentes en `examples/`, `skills/`, `src/app/api/*` (mismos 17 documentados en worklog task 11); 0 errores en panel/proveedor.
- `dev.log` → "✓ Compiled" x32, 0 errores, sin excepciones tras HMR.
- No se usó agent-browser (según instrucciones); no se reinició el dev server.
