-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0002 Identidad central
-- · profiles: tarjeta pública de CUALQUIER perfil (cliente, profesional
--   o proveedor). Todos pueden actuar como cliente (un profesional
--   puede contratar a otro profesional).
-- · profile_private: datos sensibles (teléfono, documento, domicilio,
--   cumpleaños, cómo nos encontraron) — solo el dueño.
-- · identity_documents: DNI frente/reverso — solo el dueño (moderación
--   vía service role).
-- · professional_profiles: persona única O empresa (legal_type).
-- · provider_profiles: comercio con ubicación de local.
-- ═══════════════════════════════════════════════════════════════════

-- ── Enums ──
create type public.user_role as enum ('cliente', 'profesional', 'proveedor');
create type public.legal_type as enum ('persona', 'empresa');
create type public.verification_status as enum ('pendiente', 'en_revision', 'verificado', 'rechazado');

-- ── Perfil público (tarjeta) ──
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  display_name         text not null,
  first_name           text,
  last_name            text,
  avatar_url           text,
  roles                public.user_role[] not null default array['cliente']::public.user_role[]
                       check (cardinality(roles) >= 1),
  bio                  text,
  -- Geolocalización (pins del mapa / radio de búsqueda)
  geog                 geography(point, 4326),
  location_shared      boolean not null default false,
  search_radius_km     integer not null default 10 check (search_radius_km between 1 and 100),
  -- Reputación agregada (trigger sobre reviews)
  rating_avg           numeric(3,2) not null default 0,
  rating_count         integer not null default 0,
  -- Estado
  is_verified          boolean not null default false,
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index profiles_geog_gist      on public.profiles using gist (geog);
create index profiles_roles_gin      on public.profiles using gin (roles);
create index profiles_display_trgm   on public.profiles using gin (display_name gin_trgm_ops);

-- ── Datos privados del formulario completo ──
create table public.profile_private (
  profile_id      uuid primary key references public.profiles (id) on delete cascade,
  phone           text,
  document_type   text,                       -- DNI / Pasaporte / CUIT
  document_number text,
  birth_date      date,
  address_line    text,
  address_city    text,
  address_province text,
  address_country text default 'AR',
  how_found_us    text,                       -- google / redes / recomendacion / otro
  found_us_other  text,
  updated_at      timestamptz not null default now()
);

-- ── Documentos de identidad (frente / reverso) ──
create table public.identity_documents (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  front_path   text not null,                 -- bucket privado dni-docs
  back_path    text not null,
  status       public.verification_status not null default 'pendiente',
  review_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at  timestamptz
);

create index identity_documents_profile on public.identity_documents (profile_id);

-- ── Perfil profesional (persona única o empresa) ──
create table public.professional_profiles (
  profile_id        uuid primary key references public.profiles (id) on delete cascade,
  legal_type        public.legal_type not null default 'persona',
  profession        text not null,            -- plomero, albañil, electricista…
  headline          text,
  skills            text[] not null default '{}',
  years_experience  numeric(4,1),
  experience        jsonb not null default '[]',  -- [{puesto, lugar, desde, hasta, detalle}]
  service_radius_km integer not null default 15 check (service_radius_km between 1 and 200),
  hourly_rate       numeric(12,2),
  currency          text not null default 'ARS',
  disponibilidad    text,                     -- tiempo completo / por encargo / fines de semana
  -- Datos de empresa (solo si legal_type = 'empresa')
  company_name      text,
  company_cuit      text,
  company_address   text,
  company_geog      geography(point, 4326),
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint professional_company_fields check (
    legal_type = 'persona' or (company_name is not null and company_cuit is not null)
  )
);

create index professional_profession_trgm on public.professional_profiles using gin (profession gin_trgm_ops);
create index professional_skills_gin      on public.professional_profiles using gin (skills);

-- ── Perfil proveedor (comercio / depósito) ──
create table public.provider_profiles (
  profile_id    uuid primary key references public.profiles (id) on delete cascade,
  legal_type    public.legal_type not null default 'empresa',
  business_name text not null,
  cuit          text,
  category      text,                         -- ferretería, corralón, sanitarios…
  description   text,
  address       text,
  city          text,
  province      text,
  geog          geography(point, 4326),       -- ubicación del local (pin público)
  opening_hours jsonb not null default '{}',
  logo_url      text,
  delivery      boolean not null default false,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index provider_geog_gist     on public.provider_profiles using gist (geog);
create index provider_category_trgm on public.provider_profiles using gin (category gin_trgm_ops);
create index provider_business_trgm on public.provider_profiles using gin (business_name gin_trgm_ops);

-- ═══════════════════════════════ RLS ═══════════════════════════════
alter table public.profiles            enable row level security;
alter table public.profile_private     enable row level security;
alter table public.identity_documents  enable row level security;
alter table public.professional_profiles enable row level security;
alter table public.provider_profiles   enable row level security;

-- Tarjeta pública: cualquier persona (incluso sin registro) puede VER,
-- pero solo el dueño crea/edita la suya. Abrir/comprar exige login a nivel app.
create policy "profiles_select_public" on public.profiles
  for select using (true);
create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "private_select_self" on public.profile_private
  for select using (profile_id = auth.uid());
create policy "private_insert_self" on public.profile_private
  for insert with check (profile_id = auth.uid());
create policy "private_update_self" on public.profile_private
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "dni_select_self" on public.identity_documents
  for select using (profile_id = auth.uid());
create policy "dni_insert_self" on public.identity_documents
  for insert with check (profile_id = auth.uid());
create policy "dni_update_self" on public.identity_documents
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "professional_select_public" on public.professional_profiles
  for select using (true);
create policy "professional_insert_self" on public.professional_profiles
  for insert with check (profile_id = auth.uid());
create policy "professional_update_self" on public.professional_profiles
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "provider_select_public" on public.provider_profiles
  for select using (true);
create policy "provider_insert_self" on public.provider_profiles
  for insert with check (profile_id = auth.uid());
create policy "provider_update_self" on public.provider_profiles
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ── Auto-creación de perfil al registrarse en Auth ──
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, first_name, last_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Perfil HomIA'
    ),
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
