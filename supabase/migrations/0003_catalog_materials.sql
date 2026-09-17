-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0003 Catálogo estándar + Stock de proveedores
-- · material_categories: árbol de rubros.
-- · standard_elements: lista estándar canónica de CADA elemento habido
--   por haber (nombre único + aliases) para que todos los proveedores
--   nombren igual. Homy la alimenta y normaliza (Fase 4).
-- · provider_stock: precio y stock por proveedor sobre el elemento
--   estándar; status derivado (disponible / por_agotar / agotado).
-- · stock_movements: trazabilidad (ingreso, reserva, consumo, devolución
--   —logística inversa—, ajuste).
-- · stock_reservations: materiales reservados por proyecto.
-- ═══════════════════════════════════════════════════════════════════

create table public.material_categories (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.material_categories (id) on delete set null,
  name       text not null,
  slug       text not null unique,
  icon       text,
  position   integer not null default 0
);

create table public.standard_elements (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid references public.material_categories (id) on delete set null,
  canonical_name text not null,
  aliases        text[] not null default '{}',   -- sinónimos para matching IA
  unit           text not null default 'unidad', -- unidad, m, m2, kg, l, bolsa, caja, rollo, par, juego
  specs          jsonb not null default '{}',
  is_active      boolean not null default true,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index standard_elements_name_uk
  on public.standard_elements (lower(canonical_name));
create index standard_elements_name_trgm
  on public.standard_elements using gin (canonical_name gin_trgm_ops);
create index standard_elements_aliases_gin
  on public.standard_elements using gin (aliases);
create index standard_elements_category
  on public.standard_elements (category_id);

create table public.provider_stock (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references public.profiles (id) on delete cascade,
  element_id   uuid not null references public.standard_elements (id) on delete restrict,
  brand        text,
  sku          text,
  unit         text not null default 'unidad',
  price        numeric(12,2) not null check (price >= 0),
  currency     text not null default 'ARS',
  stock_qty    numeric(12,2) not null default 0 check (stock_qty >= 0),
  min_stock    numeric(12,2) not null default 0 check (min_stock >= 0),
  -- derivado por trigger: disponible | por_agotar | agotado
  status       text not null default 'disponible',
  is_orderable boolean not null default true,   -- agotado pero pedible al proveedor mayorista
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (provider_id, element_id, brand)
);

create index provider_stock_element_price on public.provider_stock (element_id, price);
create index provider_stock_provider      on public.provider_stock (provider_id);
create index provider_stock_status        on public.provider_stock (provider_id, status);

create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  stock_id       uuid not null references public.provider_stock (id) on delete cascade,
  delta          numeric(12,2) not null,        -- + ingresa · - reserva/consumo/venta · + devolución
  reason         text not null check (reason in
                   ('ingreso','venta','reserva','liberacion','consumo','ajuste','devolucion','vencimiento')),
  ref_project_id uuid,                          -- FK a projects (se agrega en 0005)
  created_by     uuid references public.profiles (id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);

create index stock_movements_stock on public.stock_movements (stock_id, created_at desc);

create table public.stock_reservations (
  id          uuid primary key default gen_random_uuid(),
  stock_id    uuid not null references public.provider_stock (id) on delete cascade,
  project_id  uuid,                             -- FK a projects (se agrega en 0005)
  qty         numeric(12,2) not null check (qty > 0),
  status      text not null default 'reservada'
              check (status in ('reservada','consumida','liberada')),
  reserved_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index stock_reservations_project on public.stock_reservations (project_id);

-- ═══════════════════════════════ RLS ═══════════════════════════════
alter table public.material_categories   enable row level security;
alter table public.standard_elements     enable row level security;
alter table public.provider_stock        enable row level security;
alter table public.stock_movements       enable row level security;
alter table public.stock_reservations    enable row level security;

-- Catálogo: lectura pública (profesionales comparan precios sin registrarse),
-- altas por cualquier autenticado (Homy/proveedores proponen elementos nuevos),
-- edición solo del creador; la curaduría final la hace el service role.
create policy "categories_select_public" on public.material_categories
  for select using (true);
create policy "categories_insert_auth" on public.material_categories
  for insert to authenticated with check (true);

create policy "elements_select_public" on public.standard_elements
  for select using (true);
create policy "elements_insert_auth" on public.standard_elements
  for insert to authenticated with check (created_by = auth.uid() or created_by is null);
create policy "elements_update_creator" on public.standard_elements
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Stock: lectura pública (listado por precio), escritura solo del dueño.
create policy "stock_select_public" on public.provider_stock
  for select using (true);
create policy "stock_insert_owner" on public.provider_stock
  for insert to authenticated with check (provider_id = auth.uid());
create policy "stock_update_owner" on public.provider_stock
  for update using (provider_id = auth.uid()) with check (provider_id = auth.uid());
create policy "stock_delete_owner" on public.provider_stock
  for delete using (provider_id = auth.uid());

-- Movimientos y reservas: visibles para el proveedor del stock o quien los creó.
create policy "movements_select" on public.stock_movements
  for select using (
    created_by = auth.uid()
    or exists (select 1 from public.provider_stock s where s.id = stock_id and s.provider_id = auth.uid())
  );
create policy "movements_insert" on public.stock_movements
  for insert to authenticated with check (
    exists (select 1 from public.provider_stock s where s.id = stock_id and s.provider_id = auth.uid())
    or created_by = auth.uid()
  );

create policy "reservations_select" on public.stock_reservations
  for select using (
    reserved_by = auth.uid()
    or exists (select 1 from public.provider_stock s where s.id = stock_id and s.provider_id = auth.uid())
  );
create policy "reservations_insert" on public.stock_reservations
  for insert to authenticated with check (reserved_by = auth.uid());
create policy "reservations_update" on public.stock_reservations
  for update using (
    reserved_by = auth.uid()
    or exists (select 1 from public.provider_stock s where s.id = stock_id and s.provider_id = auth.uid())
  ) with check (
    reserved_by = auth.uid()
    or exists (select 1 from public.provider_stock s where s.id = stock_id and s.provider_id = auth.uid())
  );
