# HomIA · Base de datos (Supabase PostgreSQL)

Suite de migraciones de **FASE 1** que implementa la directiva completa del
producto: marketplace tripartito (cliente / profesional / proveedor), bolsa de
trabajos, proyectos con aprobación de materiales, comparables entre proveedores,
factura automática, CRM pipelines, stock con reposición, reseñas 360°,
geolocalización PostGIS y traza del super agente Homy.

## Cómo aplicarla

1. Crear el proyecto en [supabase.com](https://supabase.com) (región preferida).
2. Abrir **SQL Editor → New query**, pegar y ejecutar **en orden numérico**:

   | Archivo | Qué crea |
   |---|---|
   | `0001_extensions.sql` | PostGIS, pg_trgm, pgcrypto |
   | `0002_core_identity.sql` | Perfiles 3 roles, datos privados, DNI, profesional persona/empresa, proveedor, trigger de alta en Auth |
   | `0003_catalog_materials.sql` | Categorías, elementos estándar, stock, movimientos, reservas |
   | `0004_jobs_marketplace.sql` | Bolsa de trabajos + presupuestos privados |
   | `0005_projects_invoices.sql` | Proyectos, materiales con aprobación, facturas, vinculaciones proveedor↔profesional |
   | `0006_works_reviews.sql` | Obras realizadas + reseñas 360° con respuesta |
   | `0007_crm_notifications.sql` | CRM pipelines (profesional y proveedor) + notificaciones |
   | `0008_homy_ai.sql` | Sesiones y mensajes del agente + analítica de búsqueda |
   | `0009_functions_triggers.sql` | Motor: geo-búsqueda, matching, comparables, aceptar presupuesto, reservas, factura automática, rating agregado |
   | `0010_storage_policies.sql` | Buckets: avatars, job-photos, work-photos (públicos) · dni-docs, invoices (privados) |
   | `0011_seed_catalog.sql` | Catálogo estándar inicial (12 categorías + ~80 elementos con aliases) |

   Con CLI es equivalente: `supabase link && supabase db push`.

3. Copiar en `.env.local` del proyecto web (Fase 2 las consume):

   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...   # solo backend (movimientos de stock, Homy anónimo, PDFs)
   ```

## Regla de acceso (directiva: "se navega sin registro, se interactúa con registro")

| Qué | Anónimo | Usuario registrado |
|---|---|---|
| Ver tarjetas, bolsa de trabajos, precios de materiales, comparables, reseñas | ✅ (RLS pública) | ✅ |
| Ubicación en mapa + radio | ✅ (pin del resultado) | ✅ (su ubicación con permiso) |
| Publicar trabajo / ofertar presupuesto | ❌ | ✅ |
| Ver datos privados de una tarjeta (teléfono, contacto) | ❌ | ✅ participantes |
| Aceptar presupuesto / abrir proyecto / aprobar materiales / factura | ❌ | ✅ |
| Cargar stock, reservas, devoluciones (logística inversa) | ❌ | ✅ dueño/proceso |
| CRM pipelines, vinculaciones | ❌ | ✅ dueño |

Los datos sensibles (teléfono, documento, domicilio, cumpleaños, cómo nos
encontraron) viven en `profile_private` y los DNI en `identity_documents` +
bucket privado `dni-docs`: **nunca** viajan en la tarjeta pública, incluso
entre usuarios registrados.

## Modelo de roles (directiva: "un profesional también contrata")

- `profiles.roles` es un **array**: todo perfil nace `cliente` y puede sumar
  `profesional` y/o `proveedor` (los triggers sincronizan al crear los
  perfiles especializados). Un profesional puede publicar trabajos y contratar
  a otro profesional sin cuenta adicional.
- Profesional: `legal_type = persona | empresa` (si empresa: razón social y
  CUIT obligatorios por constraint).
- Al crear perfil profesional/proveedor se siembran sus **pipelines CRM por
  defecto** automáticamente.

## Convenciones operativas

- **Stock**: `reserve_stock()` descuenta y crea reserva → `consume_stock()` la
  cierra en consumo → `release_stock()` devuelve mercadería. `return_surplus()`
  registra la **logística inversa** (sobrantes que vuelven al proveedor).
  El status (`disponible / por_agotar / agotado`) se deriva solo contra
  `min_stock` → alimenta el pipeline de reposición.
- **Materiales de proyecto**: el profesional propone (`propuesto`), el cliente
  aprueba (`aprobado`), rechaza, o el profesional sugiere alternativa más
  barata con `alternative_of_id` apuntando al item reemplazado (`reemplazado`).
  `create_project_invoice()` arma la factura solo con aprobados + mano de obra,
  numerada `HOM-AAAA-000001`.
- **Elementos estándar**: todo proveedor cuelga precios sobre
  `standard_elements` (nombre canónico + aliases). Si un elemento no existe,
  Homy lo propone; la curaduría la hace el equipo vía service role.
- **Storage**: carpetas `/{profile_id}/...`. DNI y facturas nunca en buckets
  públicos.
- **Geo**: `profiles.geog` (usuario), `provider_profiles.geog` (local),
  `job_posts.geog` (trabajo). Funciones `nearby_*` reciben lat/lng + radio en
  metros; el radio que elige el usuario se guarda en
  `profiles.search_radius_km` (1–100 km).

## Verificación local

Este entorno de desarrollo no tiene Postgres/PostGIS instalado: la suite se
valida aplicándola en el proyecto Supabase (SQL Editor no reporta errores) y
probando las funciones de `0009` con "Run" desde el editor. Al conectar el
proyecto web (Fase 2: Auth + layout), toda lectura/escritura pasa por RLS.
