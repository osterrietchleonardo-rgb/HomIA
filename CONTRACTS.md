# CONTRACTS HomIA — referencia para desarrollo de pantallas

## Navegación (SPA hash router)
- `import { navigate, Link, useRoute } from '@/lib/router'`
- `navigate('/panel/cliente')`, `<Link to="/panel/crm">`
- `useRoute()` → `{ path, segments, query }` (ej. segments: ['panel','cliente','proyectos', id])

## Sesión
- `import { useSession, useLocation } from '@/lib/store'`
- `useSession()` → `{ user, loading, refresh, logout }`; user: `{ id, email, displayName, roles[], hasProfessional, hasProvider }`
- `useLocation()` → `{ lat, lng, radiusKm, shared, request(), setRadius(km) }`

## APIs (todas devuelven JSON; error: `{ error: string }` con status 400/401/403/404/409/500/503)

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/projects?role=` | GET | `{ asClient[], asPro[] }` — cada proyecto: `{ id, title, status, stage, laborCost, materialsCost, materialsPending, invoices[], client|pro{name,avatarUrl}, createdAt }` |
| `/api/projects/{id}` | GET | `{ project{..., client{}, professional{displayName,phone,email}}, role:'cliente'|'profesional', materials[], links[], invoices[] }` |
| `/api/projects/{id}` | PATCH | `{ stage }` o `{ status }` — etapas: presupuesto/materiales/ejecucion/revision/finalizado |
| `/api/projects` | POST | `{ professionalProfileId?, counterpartyUserId?, title, description?, laborCost? }` |
| `/api/projects/{id}/materials` | POST | `{ elementId?, name?, providerId?, quantity, unitPrice, unit?, note? }` (profesional propone) |
| `/api/projects/{id}/materials` | PATCH | `{ materialId, action:'aprobar'|'rechazar'|'reemplazar', replacement?{elementId?,name,providerId?,quantity,unitPrice,unit?} }` |
| `/api/projects/{id}/invoice` | POST | genera factura de materiales aprobados + mano de obra → `{ invoice{number,total,items[]} }` |
| `/api/projects/{id}/invoice` | GET | `{ invoices[] }` |
| `/api/invoices/{id}` | GET | `{ invoice{number,total,status,items[],project}, client, professional }` |
| `/api/invoices/{id}` | POST | inicia pago Mercado Pago → `{ initPoint }` (redirigir a initPoint) o 503 `{needsConfig:true}` |
| `/api/jobs?mine=1` | GET | mis publicaciones con bids incluidos (`bids[]` con professional) |
| `/api/jobs` | POST | `{ title, description, categorySlug, urgency?, budgetMin?, budgetMax?, address?, city?, photos?[] }` |
| `/api/jobs/{id}` | PATCH | `{ status: 'cerrado'|'cancelado'|'abierto' }` |
| `/api/bids/{id}` | PATCH | `{ action:'aceptar'|'rechazar'|'retirar' }` → aceptar crea proyecto |
| `/api/works` | GET/POST | obras realizadas; POST `{ title, description, photos[], professionalId?, projectId?, categorySlug? }` |
| `/api/reviews` | POST | `{ targetUserId, rating(1-5), comment, context?, projectId?, workId? }` |
| `/api/reviews?targetUserId=` | GET | `{ reviews[] }` (autor incluido) |
| `/api/crm/pipelines` | GET | `{ pipelines[{id,name,stages[]}], deals[] }` (crea default si no hay) |
| `/api/crm/pipelines` | POST | `{ name }` |
| `/api/crm/deals` | POST | `{ pipelineId, stageId, title, value?, counterpartyId?, note? }` |
| `/api/crm/deals` | PATCH | `{ id, stageId?, value?, title?, note? }` |
| `/api/crm/deals?id=` | DELETE | elimina trato |
| `/api/provider/stock` | GET | `{ stock[{id,elementId,name,unit,category,aliases,brand,price,quantity,minStock,status}] }` |
| `/api/provider/stock` | POST | `{ elementId, price, quantity, minStock?, brand? }` (elementId del catálogo estándar) |
| `/api/provider/stock` | PATCH | `{ id, price?, quantity?, minStock?, brand?, movementType? }` |
| `/api/provider/stock?id=` | DELETE | elimina entrada |
| `/api/provider/links` | GET | `{ asProvider[{id,accountLabel,notes,active,professional{displayName,...}}], asProfessional[{provider{businessName,...}}] }` |
| `/api/provider/links` | POST | `{ email, accountLabel, notes? }` (vincula por email) |
| `/api/provider/links` | PATCH | `{ id, active }` |
| `/api/catalog` | GET | `{ categories[{slug,name,elements[{id,name,unit,aliases}]}] }` |
| `/api/comparables?elementId=|q=` | GET | `{ results[{price,providerName,...}], best, averagePrice, count }` |
| `/api/notifications` | GET | `{ notifications[], unread }` |
| `/api/profiles/me` | GET/PUT | perfil propio completo; PUT acepta campos usuario + profesional + proveedor |
| `/api/uploads` | POST | FormData `{ file, folder }` → `{ url }` (JPG/PNG/WEBP/PDF, max 8MB) |

## Estados
- Job: abierto/en_proceso/cerrado/cancelado · Bid: pendiente/aceptado/rechazado/retirado
- Project stage: presupuesto/materiales/ejecucion/revision/finalizado · status: activo/finalizado/cancelado
- Material: propuesto/aprobado/rechazado/reemplazado · Stock: disponible/por_agotar/agotado
- Invoice: pendiente/pagada/vencida

## Categorías (slugs): plomeria, gasistas, electricistas, albanileria, pintura, carpinteria, herreria, limpieza, jardineria, climatizacion, techos, cerramientos

## UI
- Componentes: `@/components/ui/*` (shadcn completos) + `@/components/app/ui-bits` (UAvatar, UStars, UrgencyBadge, StatusBadge, Loading, EmptyState, PageHeader, StatCard)
- Toast: `import { toast } from 'sonner'` → `toast.success()`, `toast.error()`
- Paleta: navy #0A2540 · tech #1D63B8 · chalk bg · action #FF5A1F (CTA) · ai #00C4FF (solo IA/carga) · gold #FFC700
- Formato: `import { formatARS, formatDate, timeAgo } from '@/lib/format'`
- `MapPin`/`MapView` no requeridos en paneles (solo búsqueda)
- Mobile-first, tarjetas `rounded-2xl bg-white border border-slate-200 p-4 shadow-sm`
