-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0007 CRM pipelines + notificaciones
-- · crm_pipelines / crm_stages / crm_deals: herramientas de gestión.
--   El profesional administra sus clientes; el proveedor sus clientes
--   y profesionales. Al crear un perfil profesional/proveedor se siembran
--   pipelines por defecto (ensure_default_pipelines, 0009).
-- · notifications: campanita central (presupuesto aceptado, factura,
--   stock por agotar, reseñas nuevas, etc.).
-- ═══════════════════════════════════════════════════════════════════

create table public.crm_pipelines (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('profesional','proveedor')),
  name       text not null default 'Clientes',
  created_at timestamptz not null default now(),
  unique (owner_id, kind)
);

create table public.crm_stages (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.crm_pipelines (id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  is_won      boolean not null default false,
  is_lost     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index crm_stages_pipeline on public.crm_stages (pipeline_id, position);

create table public.crm_deals (
  id              uuid primary key default gen_random_uuid(),
  pipeline_id     uuid not null references public.crm_pipelines (id) on delete cascade,
  stage_id        uuid references public.crm_stages (id) on delete set null,
  counterpart_id  uuid references public.profiles (id) on delete set null,
  title           text not null,
  value           numeric(14,2) not null default 0,
  currency        text not null default 'ARS',
  source_type     text not null default 'manual'
                  check (source_type in ('bolsa','proyecto','vinculacion','manual','tienda')),
  job_post_id     uuid references public.job_posts (id) on delete set null,
  project_id      uuid references public.projects (id) on delete set null,
  provider_link_id uuid references public.provider_links (id) on delete set null,
  notes           text,
  position        integer not null default 0,
  status          text not null default 'abierto'
                  check (status in ('abierto','ganado','perdido')),
  expected_close  date,
  won_at          timestamptz,
  lost_reason     text,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index crm_deals_pipeline on public.crm_deals (pipeline_id, status, position);
create index crm_deals_counterpart on public.crm_deals (counterpart_id);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,                       -- bolsa | factura | stock | resena | vinculacion | sistema
  title      text not null,
  body       text,
  data       jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_profile on public.notifications (profile_id, created_at desc);
create index notifications_unread  on public.notifications (profile_id)
  where read_at is null;

-- ═══════════════════════════════ RLS ═══════════════════════════════
alter table public.crm_pipelines  enable row level security;
alter table public.crm_stages     enable row level security;
alter table public.crm_deals      enable row level security;
alter table public.notifications  enable row level security;

create policy "pipelines_owner" on public.crm_pipelines
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "stages_owner" on public.crm_stages
  for all using (
    exists (select 1 from public.crm_pipelines p where p.id = pipeline_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.crm_pipelines p where p.id = pipeline_id and p.owner_id = auth.uid())
  );

create policy "deals_owner" on public.crm_deals
  for all using (
    exists (select 1 from public.crm_pipelines p where p.id = pipeline_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.crm_pipelines p where p.id = pipeline_id and p.owner_id = auth.uid())
  );

-- Notificaciones: el sistema las crea (service role), el dueño las lee y marca.
create policy "notifications_select_owner" on public.notifications
  for select using (profile_id = auth.uid());
create policy "notifications_update_owner" on public.notifications
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "notifications_delete_owner" on public.notifications
  for delete using (profile_id = auth.uid());
