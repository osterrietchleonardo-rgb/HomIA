-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0006 Obras realizadas + Reseñas 360°
-- · completed_works: publicado por el CLIENTE (vinculando o no al
--   profesional) o por el PROFESIONAL (mostrando su proyecto, con fotos).
--   Queda en el perfil de ambos cuando están vinculados.
-- · reviews: doble vía (cliente↔profesional, cliente↔proveedor,
--   profesional↔proveedor, profesional↔profesional). El reseñado puede
--   RESPONDER (reply) sin tocar el contenido. El promedio se calcula
--   por trigger sobre profiles.rating_avg / rating_count.
-- ═══════════════════════════════════════════════════════════════════

create table public.completed_works (
  id                    uuid primary key default gen_random_uuid(),
  author_id             uuid not null references public.profiles (id) on delete cascade,
  professional_id       uuid references public.profiles (id) on delete set null,
  client_id             uuid references public.profiles (id) on delete set null,
  project_id            uuid references public.projects (id) on delete set null,
  job_post_id           uuid references public.job_posts (id) on delete set null,
  title                 text not null,
  description           text,
  photos                text[] not null default '{}',
  profession            text,
  tags                  text[] not null default '{}',
  location_text         text,
  is_public             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index works_author        on public.completed_works (author_id, created_at desc);
create index works_professional  on public.completed_works (professional_id, created_at desc)
  where professional_id is not null;
create index works_client        on public.completed_works (client_id, created_at desc)
  where client_id is not null;
create index works_profession_trgm on public.completed_works using gin (profession gin_trgm_ops);

create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  work_id      uuid references public.completed_works (id) on delete set null,
  project_id   uuid references public.projects (id) on delete set null,
  job_post_id  uuid references public.job_posts (id) on delete set null,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  context      text not null check (context in
                 ('cliente_a_profesional','profesional_a_cliente',
                  'cliente_a_proveedor','profesional_a_proveedor',
                  'profesional_a_profesional')),
  rating       integer not null check (rating between 1 and 5),
  title        text,
  comment      text,
  photos       text[] not null default '{}',
  reply        text,        -- respuesta del reseñado (única columna que puede tocar)
  replied_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (author_id <> target_id)
);

-- Una reseña por obra y autor (no se publica dos veces sobre la misma obra).
create unique index reviews_work_author_uk on public.reviews (work_id, author_id)
  where work_id is not null;
-- Una reseña por proyecto, autor y dirección.
create unique index reviews_project_author_uk on public.reviews (project_id, author_id, context)
  where project_id is not null;
create index reviews_target on public.reviews (target_id, created_at desc);

-- ═══════════════════════════════ RLS ═══════════════════════════════
alter table public.completed_works enable row level security;
alter table public.reviews         enable row level security;

create policy "works_select_public" on public.completed_works
  for select using (is_public = true or author_id = auth.uid()
    or professional_id = auth.uid() or client_id = auth.uid());
create policy "works_insert_owner" on public.completed_works
  for insert to authenticated with check (author_id = auth.uid());
create policy "works_update_owner" on public.completed_works
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "works_delete_owner" on public.completed_works
  for delete using (author_id = auth.uid());

create policy "reviews_select_public" on public.reviews
  for select using (true);
create policy "reviews_insert_author" on public.reviews
  for insert to authenticated with check (
    author_id = auth.uid()
    -- el autor debió participar del proyecto o la obra que reseña
    and (
      work_id is null or exists (
        select 1 from public.completed_works w
        where w.id = work_id
          and (w.author_id = auth.uid() or w.professional_id = auth.uid() or w.client_id = auth.uid())
      )
    )
    and (
      project_id is null or exists (
        select 1 from public.projects p
        where p.id = project_id
          and (p.client_id = auth.uid() or p.professional_id = auth.uid())
      )
    )
  );
create policy "reviews_update_author_or_target" on public.reviews
  for update using (author_id = auth.uid() or target_id = auth.uid())
  with check (author_id = auth.uid() or target_id = auth.uid());
create policy "reviews_delete_author" on public.reviews
  for delete using (author_id = auth.uid());

-- Guardián: el reseñado SOLO puede escribir reply / replied_at.
create or replace function public.reviews_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.author_id = auth.uid() then
      return new;                                   -- el autor edita libremente
    end if;
    if old.target_id = auth.uid() then              -- el reseñado responde
      new.reply      := coalesce(new.reply, old.reply);
      new.replied_at := coalesce(new.replied_at, old.replied_at);
      new.rating     := old.rating;
      new.title      := old.title;
      new.comment    := old.comment;
      new.photos     := old.photos;
      new.author_id  := old.author_id;
      new.target_id  := old.target_id;
      new.work_id    := old.work_id;
      new.project_id := old.project_id;
      new.job_post_id := old.job_post_id;
      return new;
    end if;
    raise exception 'Sin permiso para modificar esta reseña';
  end if;
  return new;
end;
$$;

create trigger reviews_guard_trigger
  before update on public.reviews
  for each row execute function public.reviews_guard();
