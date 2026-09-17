-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0008 Homy (super agente IA) + analítica de búsqueda
-- · homy_sessions: una sesión de conversación (permite anónimos — el
--   backend la maneja con service role mientras el usuario no registró).
-- · homy_messages: cada turno; guarda el INTENTO parseado (modo
--   cliente/profesional, categoría, urgencia, slot-filling) y qué
--   herramientas usó el agente (loop + graph + reasoning queda en el
--   orquestador; aquí queda la traza consultable).
-- · search_events: analítica de búsquedas (query cruda + parseo +
--   resultados) para mejorar el agente.
-- ═══════════════════════════════════════════════════════════════════

create table public.homy_sessions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,  -- null = anónimo
  channel    text not null default 'home'
             check (channel in ('home','chat','profesional','proveedor','bolsa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index homy_sessions_profile on public.homy_sessions (profile_id, created_at desc);

create table public.homy_messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.homy_sessions (id) on delete cascade,
  role          text not null check (role in ('user','homy','sistema','herramienta')),
  content       text not null,
  intent        jsonb,      -- {modo, categoria, urgencia, slots{...}, pregunta_actual, faltantes[]}
  tool_name     text,       -- buscar_profesionales | buscar_elementos | comparar_precios | buscar_trabajos…
  tool_payload  jsonb,
  created_at    timestamptz not null default now()
);

create index homy_messages_session on public.homy_messages (session_id, created_at);

create table public.search_events (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles (id) on delete set null,
  session_id    uuid references public.homy_sessions (id) on delete set null,
  mode          text not null check (mode in ('cliente','profesional')),
  raw_query     text not null,
  parsed        jsonb,
  results_count integer,
  created_at    timestamptz not null default now()
);

create index search_events_mode on public.search_events (mode, created_at desc);

-- ═══════════════════════════════ RLS ═══════════════════════════════
-- Las sesiones anónimas y la escritura de mensajes las maneja el backend
-- con service role (bypass RLS). El usuario registrado lee solo lo suyo.
alter table public.homy_sessions enable row level security;
alter table public.homy_messages enable row level security;
alter table public.search_events enable row level security;

create policy "homy_sessions_select_owner" on public.homy_sessions
  for select using (profile_id = auth.uid());
create policy "homy_sessions_insert_owner" on public.homy_sessions
  for insert to authenticated with check (profile_id = auth.uid());
create policy "homy_sessions_update_owner" on public.homy_sessions
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "homy_messages_select_owner" on public.homy_messages
  for select using (
    exists (
      select 1 from public.homy_sessions s
      where s.id = session_id and s.profile_id = auth.uid()
    )
  );

create policy "search_events_select_owner" on public.search_events
  for select using (profile_id = auth.uid());
