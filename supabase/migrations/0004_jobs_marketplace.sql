-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0004 Bolsa de trabajos + presupuestos
-- · job_posts: el USUARIO publica el trabajo que necesita (con fotos,
--   ubicación y urgencia); los PROFESIONALES lo encuentran buscando
--   "¿qué hay para plomeros?".
-- · job_bids: presupuesto aproximado que deja cada profesional sobre la
--   publicación; el usuario compara perfiles y acepta o rechaza.
-- · accept_job_bid() (en 0009) crea el proyecto al aceptar.
-- ═══════════════════════════════════════════════════════════════════

create table public.job_posts (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references public.profiles (id) on delete cascade,
  title                  text not null,
  description            text not null,
  profession             text not null,          -- oficio buscado (normalizado por Homy)
  tags                   text[] not null default '{}',
  photos                 text[] not null default '{}',
  geog                   geography(point, 4326), -- pin del mapa
  area_text              text,                   -- "Palermo, CABA" (legible)
  budget_min             numeric(12,2),
  budget_max             numeric(12,2),
  urgency                text not null default 'normal'
                         check (urgency in ('baja','normal','alta')),
  status                 text not null default 'abierto'
                         check (status in ('abierto','asignado','en_curso','completado','cancelado')),
  accepted_bid_id        uuid,                   -- FK agregada abajo (dependencia circular)
  hired_professional_id  uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.job_bids (
  id              uuid primary key default gen_random_uuid(),
  job_post_id     uuid not null references public.job_posts (id) on delete cascade,
  professional_id uuid not null references public.profiles (id) on delete cascade,
  amount          numeric(12,2),
  currency        text not null default 'ARS',
  includes_materials boolean not null default false,
  message         text,
  eta_days        integer,
  status          text not null default 'enviado'
                  check (status in ('enviado','aceptado','rechazado','retirado')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (job_post_id, professional_id)
);

alter table public.job_posts
  add constraint job_posts_accepted_bid_fk
  foreign key (accepted_bid_id) references public.job_bids (id) on delete set null;

-- Índices de búsqueda: por oficio (difusa), por estado, por cercanía.
create index job_posts_profession_trgm on public.job_posts using gin (profession gin_trgm_ops);
create index job_posts_title_trgm      on public.job_posts using gin (title gin_trgm_ops);
create index job_posts_status          on public.job_posts (status, created_at desc);
create index job_posts_geog_gist       on public.job_posts using gist (geog);
create index job_bids_professional     on public.job_bids (professional_id, status);

-- ═══════════════════════════════ RLS ═══════════════════════════════
alter table public.job_posts enable row level security;
alter table public.job_bids  enable row level security;

-- La bolsa es navegable SIN registro (abrir tarjeta exige login a nivel app).
create policy "jobs_select_public" on public.job_posts
  for select using (true);
create policy "jobs_insert_owner" on public.job_posts
  for insert to authenticated with check (client_id = auth.uid());
create policy "jobs_update_owner" on public.job_posts
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy "jobs_delete_owner" on public.job_posts
  for delete using (client_id = auth.uid() and status = 'abierto');

-- Los presupuestos son PRIVADOS: solo el profesional que ofertó y el
-- dueño del trabajo los ven (nadie copia presupuestos de colegas).
create policy "bids_select_participants" on public.job_bids
  for select using (
    professional_id = auth.uid()
    or exists (
      select 1 from public.job_posts j
      where j.id = job_post_id and j.client_id = auth.uid()
    )
  );
create policy "bids_insert_professional" on public.job_bids
  for insert to authenticated with check (
    professional_id = auth.uid()
    and exists (
      select 1 from public.job_posts j
      where j.id = job_post_id and j.status = 'abierto'
    )
  );
create policy "bids_update_participants" on public.job_bids
  for update using (
    professional_id = auth.uid()
    or exists (
      select 1 from public.job_posts j
      where j.id = job_post_id and j.client_id = auth.uid()
    )
  ) with check (
    professional_id = auth.uid()
    or exists (
      select 1 from public.job_posts j
      where j.id = job_post_id and j.client_id = auth.uid()
    )
  );
create policy "bids_delete_professional" on public.job_bids
  for delete using (professional_id = auth.uid() and status = 'enviado');
