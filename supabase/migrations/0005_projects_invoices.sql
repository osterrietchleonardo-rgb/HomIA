-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0005 Proyectos, materiales, facturas y vinculaciones
-- · projects: relación profesional ↔ cliente (nace de la bolsa, o
--   directa — incluso entre profesionales).
-- · project_material_items: materiales por proyecto. El profesional
--   PROPONE, el cliente APRUEBA o pide alternativa más barata
--   (alternative_of_id). Cada item ancla proveedor + stock + precio.
-- · invoices / invoice_items: factura automática con detalle explícito
--   (create_project_invoice() en 0009).
-- · provider_links: vinculación directa proveedor ↔ profesional para
--   cuentas de retiro de materiales.
-- ═══════════════════════════════════════════════════════════════════

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete cascade,
  job_post_id     uuid references public.job_posts (id) on delete set null,
  bid_id          uuid references public.job_bids (id) on delete set null,
  title           text not null,
  description     text,
  status          text not null default 'planificacion'
                  check (status in ('planificacion','presupuesto','materiales','en_curso','finalizado','cancelado')),
  labor_amount    numeric(12,2) not null default 0,   -- mano de obra acordada
  currency        text not null default 'ARS',
  geog            geography(point, 4326),
  address_text    text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index projects_client        on public.projects (client_id, status);
create index projects_professional  on public.projects (professional_id, status);
create index projects_geog_gist     on public.projects using gist (geog);

create table public.project_material_items (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  element_id        uuid references public.standard_elements (id) on delete set null,
  stock_id          uuid references public.provider_stock (id) on delete set null, -- oferta elegida
  provider_id       uuid references public.profiles (id) on delete set null,
  description       text not null,               -- detalle legible en la factura
  qty               numeric(12,2) not null check (qty > 0),
  unit              text not null default 'unidad',
  unit_price        numeric(12,2) not null default 0 check (unit_price >= 0),
  status            text not null default 'propuesto'
                    check (status in ('propuesto','aprobado','rechazado','reemplazado')),
  alternative_of_id uuid references public.project_material_items (id) on delete set null,
  proposed_by       uuid references public.profiles (id) on delete set null,
  decided_by        uuid references public.profiles (id) on delete set null,
  decided_at        timestamptz,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index project_items_project on public.project_material_items (project_id, status);

-- Secuencia global para numeración de facturas (HOM-AAAA-000001)
create sequence public.invoice_number_seq start 1;

create table public.invoices (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  number     text not null unique
             default ('HOM-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  status     text not null default 'borrador'
             check (status in ('borrador','emitida','pagada','anulada')),
  subtotal   numeric(14,2) not null default 0,
  tax_rate   numeric(5,2)  not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total      numeric(14,2) not null default 0,
  currency   text not null default 'ARS',
  pdf_path   text,                                -- bucket privado invoices
  issued_at  timestamptz,
  due_date   date,
  paid_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_project on public.invoices (project_id);

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  kind        text not null default 'material'
              check (kind in ('material','mano_obra','otro')),
  description text not null,
  element_id  uuid references public.standard_elements (id) on delete set null,
  qty         numeric(12,2) not null default 1 check (qty > 0),
  unit        text not null default 'unidad',
  unit_price  numeric(12,2) not null default 0,
  total       numeric(14,2) not null default 0,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index invoice_items_invoice on public.invoice_items (invoice_id, position);

create table public.provider_links (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references public.profiles (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'pendiente'
                  check (status in ('pendiente','activa','pausada','rechazada')),
  account_number  text,        -- nº de cuenta de retiro de materiales
  credit_days     integer not null default 0 check (credit_days >= 0),
  notes           text,
  requested_by    uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider_id, professional_id)
);

create index provider_links_professional on public.provider_links (professional_id, status);

-- FKs retardadas desde 0003 (stock ↔ proyectos)
alter table public.stock_movements
  add constraint stock_movements_project_fk
  foreign key (ref_project_id) references public.projects (id) on delete set null;

alter table public.stock_reservations
  add constraint stock_reservations_project_fk
  foreign key (project_id) references public.projects (id) on delete cascade;

-- ═══════════════════════════════ RLS ═══════════════════════════════
alter table public.projects               enable row level security;
alter table public.project_material_items enable row level security;
alter table public.invoices               enable row level security;
alter table public.invoice_items          enable row level security;
alter table public.provider_links         enable row level security;

-- Proyectos: solo participantes (cliente y profesional).
create policy "projects_select_participants" on public.projects
  for select using (client_id = auth.uid() or professional_id = auth.uid());
create policy "projects_insert_client" on public.projects
  for insert to authenticated with check (client_id = auth.uid());
-- El profesional también puede iniciar un proyecto (contrata/provee a otro profesional).
create policy "projects_insert_professional" on public.projects
  for insert to authenticated with check (professional_id = auth.uid());
create policy "projects_update_participants" on public.projects
  for update using (client_id = auth.uid() or professional_id = auth.uid())
  with check (client_id = auth.uid() or professional_id = auth.uid());

-- Materiales del proyecto: participantes.
create policy "pmi_select_participants" on public.project_material_items
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.client_id = auth.uid() or p.professional_id = auth.uid())
    )
  );
create policy "pmi_insert_participants" on public.project_material_items
  for insert to authenticated with check (
    proposed_by = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.client_id = auth.uid() or p.professional_id = auth.uid())
    )
  );
create policy "pmi_update_participants" on public.project_material_items
  for update using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.client_id = auth.uid() or p.professional_id = auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.client_id = auth.uid() or p.professional_id = auth.uid())
    )
  );

-- Facturas: solo participantes; alta por el profesional (o service role).
create policy "invoices_select_participants" on public.invoices
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.client_id = auth.uid() or p.professional_id = auth.uid())
    )
  );
create policy "invoices_insert_professional" on public.invoices
  for insert to authenticated with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.professional_id = auth.uid()
    )
  );
create policy "invoices_update_professional" on public.invoices
  for update using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.professional_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.professional_id = auth.uid()
    )
  );

create policy "invoice_items_select_participants" on public.invoice_items
  for select using (
    exists (
      select 1 from public.invoices i
      join public.projects p on p.id = i.project_id
      where i.id = invoice_id
        and (p.client_id = auth.uid() or p.professional_id = auth.uid())
    )
  );
create policy "invoice_items_insert_professional" on public.invoice_items
  for insert to authenticated with check (
    exists (
      select 1 from public.invoices i
      join public.projects p on p.id = i.project_id
      where i.id = invoice_id and p.professional_id = auth.uid()
    )
  );
create policy "invoice_items_update_professional" on public.invoice_items
  for update using (
    exists (
      select 1 from public.invoices i
      join public.projects p on p.id = i.project_id
      where i.id = invoice_id and p.professional_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.invoices i
      join public.projects p on p.id = i.project_id
      where i.id = invoice_id and p.professional_id = auth.uid()
    )
  );

-- Vinculaciones proveedor ↔ profesional: visibles entre las partes.
create policy "links_select_participants" on public.provider_links
  for select using (provider_id = auth.uid() or professional_id = auth.uid());
create policy "links_insert_participant" on public.provider_links
  for insert to authenticated with check (
    requested_by = auth.uid()
    and (provider_id = auth.uid() or professional_id = auth.uid())
  );
create policy "links_update_participants" on public.provider_links
  for update using (provider_id = auth.uid() or professional_id = auth.uid())
  with check (provider_id = auth.uid() or professional_id = auth.uid());
