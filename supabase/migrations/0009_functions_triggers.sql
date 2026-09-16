-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0009 Funciones y triggers del motor
-- 1. updated_at automático en todas las tablas.
-- 2. Rol sincronizado + pipelines CRM por defecto al crear perfiles
--    profesional/proveedor.
-- 3. Status de stock derivado (disponible / por_agotar / agotado).
-- 4. Reputación agregada (rating_avg / rating_count en profiles).
-- 5. accept_job_bid(): el cliente acepta un presupuesto → proyecto +
--    notificación.
-- 6. create_project_invoice(): factura automática con detalle explícito
--    (materiales aprobados + mano de obra).
-- 7. reserve_stock / consume_stock / release_stock: reservas por
--    proyecto con movimientos trazables.
-- 8. Búsqueda geolocalizada y difusa: nearby_profiles,
--    nearby_providers, nearby_job_posts, match_elements,
--    element_comparables.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────── 1. updated_at ─────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','profile_private','professional_profiles','provider_profiles',
    'standard_elements','provider_stock','stock_reservations',
    'job_posts','job_bids',
    'projects','project_material_items','invoices',
    'provider_links','completed_works','reviews',
    'crm_deals','homy_sessions'
  ] loop
    execute format(
      'create trigger set_updated_at_%s before update on public.%I
       for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ──────────── 2. Roles sincronizados + CRM por defecto ────────────
create or replace function public.ensure_default_pipelines(p_owner uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pipe uuid;
begin
  insert into public.crm_pipelines (owner_id, kind, name)
  values (
    p_owner, p_kind,
    case when p_kind = 'profesional' then 'Clientes' else 'Clientes y profesionales' end
  )
  on conflict (owner_id, kind) do nothing;

  select id into v_pipe
  from public.crm_pipelines
  where owner_id = p_owner and kind = p_kind;

  if v_pipe is not null and not exists (
    select 1 from public.crm_stages where pipeline_id = v_pipe
  ) then
    if p_kind = 'profesional' then
      insert into public.crm_stages (pipeline_id, name, position, is_won, is_lost) values
        (v_pipe, 'Nuevo contacto',        0, false, false),
        (v_pipe, 'En conversación',       1, false, false),
        (v_pipe, 'Presupuesto enviado',   2, false, false),
        (v_pipe, 'En obra',               3, false, false),
        (v_pipe, 'Cobrado',               4, true,  false),
        (v_pipe, 'Descartado',            5, false, true);
    else
      insert into public.crm_stages (pipeline_id, name, position, is_won, is_lost) values
        (v_pipe, 'Contacto nuevo',        0, false, false),
        (v_pipe, 'Cotizando',             1, false, false),
        (v_pipe, 'Pedido en curso',       2, false, false),
        (v_pipe, 'Cliente recurrente',    3, true,  false),
        (v_pipe, 'Descartado',            4, false, true);
    end if;
  end if;
end;
$$;

create or replace function public.sync_professional_role()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.profiles
  set roles = case
        when 'profesional' = any(roles) then roles
        else roles || 'profesional'::public.user_role
      end
  where id = new.profile_id;

  perform public.ensure_default_pipelines(new.profile_id, 'profesional');
  return new;
end;
$$;

create trigger professional_profile_created
  after insert on public.professional_profiles
  for each row execute function public.sync_professional_role();

create or replace function public.sync_provider_role()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.profiles
  set roles = case
        when 'proveedor' = any(roles) then roles
        else roles || 'proveedor'::public.user_role
      end
  where id = new.profile_id;

  perform public.ensure_default_pipelines(new.profile_id, 'proveedor');
  return new;
end;
$$;

create trigger provider_profile_created
  after insert on public.provider_profiles
  for each row execute function public.sync_provider_role();

-- ───────────────── 3. Status derivado del stock ─────────────────
create or replace function public.derive_stock_status()
returns trigger
language plpgsql
as $$
begin
  new.status := case
    when new.stock_qty <= 0 then 'agotado'
    when new.stock_qty <= new.min_stock then 'por_agotar'
    else 'disponible'
  end;
  return new;
end;
$$;

create trigger stock_status_trigger
  before insert or update of stock_qty, min_stock on public.provider_stock
  for each row execute function public.derive_stock_status();

-- ───────────── 4. Reputación agregada (reseñas 360°) ─────────────
create or replace function public.refresh_profile_rating(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.profiles pr
  set rating_avg   = coalesce(s.avg_r, 0),
      rating_count = coalesce(s.cnt, 0)
  from (
    select round(avg(rating)::numeric, 2) as avg_r, count(*) as cnt
    from public.reviews
    where target_id = p_target
  ) s
  where pr.id = p_target;
end;
$$;

create or replace function public.reviews_aggregate()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_target uuid;
begin
  v_target := case
    when tg_op = 'DELETE' then old.target_id
    else new.target_id
  end;
  perform public.refresh_profile_rating(v_target);
  return null;
end;
$$;

create trigger reviews_aggregate_trigger
  after insert or update or delete on public.reviews
  for each row execute function public.reviews_aggregate();

-- ──────────────── 5. Aceptar presupuesto de la bolsa ────────────────
create or replace function public.accept_job_bid(p_job_post_id uuid, p_bid_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_client uuid;
  v_title  text;
  v_prof   uuid;
  v_project uuid;
begin
  select client_id, title into v_client, v_title
  from public.job_posts where id = p_job_post_id;

  if v_client is null then
    raise exception 'Trabajo no encontrado';
  end if;
  if v_client <> auth.uid() then
    raise exception 'Solo quien publicó el trabajo puede aceptar presupuestos';
  end if;

  select professional_id into v_prof
  from public.job_bids
  where id = p_bid_id and job_post_id = p_job_post_id and status = 'enviado';

  if v_prof is null then
    raise exception 'El presupuesto no está disponible para aceptarse';
  end if;

  update public.job_bids
  set status = 'aceptado' where id = p_bid_id;

  update public.job_bids
  set status = 'rechazado'
  where job_post_id = p_job_post_id and id <> p_bid_id and status = 'enviado';

  update public.job_posts
  set status = 'asignado',
      accepted_bid_id = p_bid_id,
      hired_professional_id = v_prof
  where id = p_job_post_id;

  insert into public.projects (client_id, professional_id, job_post_id, bid_id, title, status)
  values (v_client, v_prof, p_job_post_id, p_bid_id, v_title, 'planificacion')
  returning id into v_project;

  insert into public.notifications (profile_id, kind, title, body, data)
  values (
    v_prof, 'bolsa', '¡Aceptaron tu presupuesto!',
    'Tu presupuesto para "' || v_title || '" fue aceptado. Se creó el proyecto.',
    jsonb_build_object('project_id', v_project, 'job_post_id', p_job_post_id)
  );

  return v_project;
end;
$$;

-- ──────────────── 6. Factura automática del proyecto ────────────────
create or replace function public.create_project_invoice(
  p_project uuid,
  p_tax_rate numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_inv      uuid;
  v_subtotal numeric(14,2);
  v_labor    numeric(12,2);
  v_currency text;
  v_client   uuid;
  v_prof     uuid;
begin
  select labor_amount, currency, client_id, professional_id
  into v_labor, v_currency, v_client, v_prof
  from public.projects where id = p_project;

  if v_prof is null then
    raise exception 'Proyecto no encontrado';
  end if;
  if v_prof <> auth.uid() then
    raise exception 'Solo el profesional del proyecto puede generar la factura';
  end if;
  if exists (
    select 1 from public.invoices
    where project_id = p_project and status <> 'anulada'
  ) then
    raise exception 'El proyecto ya tiene una factura activa';
  end if;

  insert into public.invoices (project_id, status, tax_rate, currency)
  values (p_project, 'borrador', p_tax_rate, v_currency)
  returning id into v_inv;

  -- Materiales aprobados, con detalle explícito
  insert into public.invoice_items
    (invoice_id, kind, description, element_id, qty, unit, unit_price, total, position)
  select
    v_inv, 'material', i.description, i.element_id,
    i.qty, i.unit, i.unit_price, round(i.qty * i.unit_price, 2),
    row_number() over (order by i.created_at)
  from public.project_material_items i
  where i.project_id = p_project and i.status = 'aprobado';

  -- Mano de obra
  if v_labor > 0 then
    insert into public.invoice_items
      (invoice_id, kind, description, qty, unit, unit_price, total, position)
    values (v_inv, 'mano_obra', 'Mano de obra', 1, 'global', v_labor, v_labor, 999);
  end if;

  select coalesce(sum(total), 0) into v_subtotal
  from public.invoice_items where invoice_id = v_inv;

  update public.invoices
  set subtotal   = v_subtotal,
      tax_amount = round(v_subtotal * p_tax_rate / 100, 2),
      total      = round(v_subtotal * (1 + p_tax_rate / 100), 2)
  where id = v_inv;

  insert into public.notifications (profile_id, kind, title, body, data)
  values (
    v_client, 'factura', 'Nueva factura del proyecto',
    'Tu profesional generó la factura con el detalle completo de materiales y mano de obra.',
    jsonb_build_object('invoice_id', v_inv, 'project_id', p_project)
  );

  return v_inv;
end;
$$;

-- ──────────────── 7. Reservas de stock por proyecto ────────────────
create or replace function public.reserve_stock(
  p_stock_id uuid,
  p_project_id uuid,
  p_qty numeric,
  p_profile uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_provider uuid;
  v_qty numeric;
  v_res uuid;
  v_actor uuid := coalesce(p_profile, auth.uid());
begin
  select provider_id, stock_qty into v_provider, v_qty
  from public.provider_stock where id = p_stock_id for update;

  if v_provider is null then
    raise exception 'Stock no encontrado';
  end if;
  if p_qty <= 0 then
    raise exception 'La cantidad debe ser positiva';
  end if;
  if v_qty < p_qty then
    raise exception 'Stock insuficiente: quedan %', v_qty;
  end if;

  update public.provider_stock
  set stock_qty = stock_qty - p_qty
  where id = p_stock_id;

  insert into public.stock_reservations (stock_id, project_id, qty, reserved_by)
  values (p_stock_id, p_project_id, p_qty, v_actor)
  returning id into v_res;

  insert into public.stock_movements (stock_id, delta, reason, ref_project_id, created_by, note)
  values (p_stock_id, -p_qty, 'reserva', p_project_id, v_actor, 'Reserva para proyecto');

  return v_res;
end;
$$;

create or replace function public.consume_stock(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_res record;
begin
  select * into v_res from public.stock_reservations
  where id = p_reservation_id and status = 'reservada' for update;

  if v_res is null then
    raise exception 'Reserva no encontrada o ya cerrada';
  end if;

  update public.stock_reservations
  set status = 'consumida' where id = p_reservation_id;

  insert into public.stock_movements (stock_id, delta, reason, ref_project_id, created_by, note)
  values (v_res.stock_id, 0, 'consumo', v_res.project_id, auth.uid(), 'Reserva consumida');
end;
$$;

create or replace function public.release_stock(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_res record;
begin
  select * into v_res from public.stock_reservations
  where id = p_reservation_id and status = 'reservada' for update;

  if v_res is null then
    raise exception 'Reserva no encontrada o ya cerrada';
  end if;

  update public.stock_reservations
  set status = 'liberada' where id = p_reservation_id;

  update public.provider_stock
  set stock_qty = stock_qty + v_res.qty
  where id = v_res.stock_id;

  insert into public.stock_movements (stock_id, delta, reason, ref_project_id, created_by, note)
  values (v_res.stock_id, v_res.qty, 'liberacion', v_res.project_id, auth.uid(), 'Reserva liberada');
end;
$$;

-- Logística inversa: el cliente devuelve sobrantes al proveedor.
create or replace function public.return_surplus(
  p_stock_id uuid,
  p_project_id uuid,
  p_qty numeric,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_qty <= 0 then
    raise exception 'La cantidad debe ser positiva';
  end if;

  update public.provider_stock
  set stock_qty = stock_qty + p_qty
  where id = p_stock_id;

  insert into public.stock_movements (stock_id, delta, reason, ref_project_id, created_by, note)
  values (p_stock_id, p_qty, 'devolucion', p_project_id, auth.uid(), p_note);
end;
$$;

-- ─────────── 8. Búsqueda geolocalizada + difusa (Homy) ───────────

-- Profesionales cerca de un punto, opcionalmente por oficio.
create or replace function public.nearby_profiles(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 10000,
  p_profession text default null,
  p_limit integer default 50
)
returns table (
  id           uuid,
  display_name text,
  avatar_url   text,
  profession   text,
  rating_avg   numeric,
  rating_count integer,
  distance_m   double precision,
  geog         geography
)
language sql
stable
set search_path = public, extensions
as $$
  select
    pr.id, pr.display_name, pr.avatar_url,
    pp.profession, pr.rating_avg, pr.rating_count,
    st_distance(pr.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m,
    pr.geog
  from public.profiles pr
  join public.professional_profiles pp on pp.profile_id = pr.id
  where pr.geog is not null
    and st_dwithin(pr.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and (
      p_profession is null
      or pp.profession ilike '%' || p_profession || '%'
      or similarity(pp.profession, p_profession) > 0.3
      or exists (select 1 from unnest(pp.skills) sk where sk ilike '%' || p_profession || '%')
    )
  order by distance_m
  limit p_limit;
$$;

-- Proveedores cerca (para comparar precios con distancia al local).
create or replace function public.nearby_providers(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 20000,
  p_category text default null,
  p_limit integer default 50
)
returns table (
  id            uuid,
  display_name  text,
  avatar_url    text,
  business_name text,
  category      text,
  rating_avg    numeric,
  rating_count  integer,
  address       text,
  delivery      boolean,
  distance_m    double precision,
  geog          geography
)
language sql
stable
set search_path = public, extensions
as $$
  select
    pr.id, pr.display_name, pr.avatar_url,
    pv.business_name, pv.category, pr.rating_avg, pr.rating_count,
    pv.address, pv.delivery,
    st_distance(pv.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m,
    pv.geog
  from public.provider_profiles pv
  join public.profiles pr on pr.id = pv.profile_id
  where pv.geog is not null
    and st_dwithin(pv.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and (
      p_category is null
      or pv.category ilike '%' || p_category || '%'
      or similarity(pv.category, p_category) > 0.3
    )
  order by distance_m
  limit p_limit;
$$;

-- Bolsa: trabajos publicados cerca, por oficio.
create or replace function public.nearby_job_posts(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 20000,
  p_profession text default null,
  p_limit integer default 50
)
returns table (
  id         uuid,
  title      text,
  profession text,
  urgency    text,
  budget_min numeric,
  budget_max numeric,
  area_text  text,
  status     text,
  distance_m double precision,
  geog       geography
)
language sql
stable
set search_path = public, extensions
as $$
  select
    j.id, j.title, j.profession, j.urgency,
    j.budget_min, j.budget_max, j.area_text, j.status,
    st_distance(j.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m,
    j.geog
  from public.job_posts j
  where j.status = 'abierto'
    and j.geog is not null
    and st_dwithin(j.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and (
      p_profession is null
      or j.profession ilike '%' || p_profession || '%'
      or similarity(j.profession, p_profession) > 0.3
      or exists (select 1 from unnest(j.tags) tg where tg ilike '%' || p_profession || '%')
    )
  order by distance_m
  limit p_limit;
$$;

-- Matching de elementos estándar por nombre libre (con sinónimos).
create or replace function public.match_elements(
  p_query text,
  p_limit integer default 20
)
returns table (
  id             uuid,
  canonical_name text,
  unit           text,
  category_id    uuid,
  score          real
)
language sql
stable
set search_path = public, extensions
as $$
  select
    e.id, e.canonical_name, e.unit, e.category_id,
    greatest(
      similarity(e.canonical_name, p_query),
      coalesce((select max(similarity(a, p_query)) from unnest(e.aliases) a), 0)
    ) as score
  from public.standard_elements e
  where e.is_active
    and (
      e.canonical_name % p_query
      or e.canonical_name ilike '%' || p_query || '%'
      or exists (select 1 from unnest(e.aliases) a where a % p_query or a ilike '%' || p_query || '%')
    )
  order by score desc
  limit p_limit;
$$;

-- Comparables: todas las ofertas de un elemento entre proveedores,
-- filtradas por cercanía y ordenadas por precio.
create or replace function public.element_comparables(
  p_element_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_m integer default 20000,
  p_limit integer default 50
)
returns table (
  stock_id     uuid,
  provider_id  uuid,
  provider     text,
  brand        text,
  price        numeric,
  currency     text,
  stock_qty    numeric,
  status       text,
  is_orderable boolean,
  distance_m   double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    s.id, s.provider_id, pv.business_name, s.brand,
    s.price, s.currency, s.stock_qty, s.status, s.is_orderable,
    case
      when p_lat is null or pv.geog is null then null
      else st_distance(pv.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
    end as distance_m
  from public.provider_stock s
  join public.provider_profiles pv on pv.profile_id = s.provider_id
  where s.element_id = p_element_id
    and (s.stock_qty > 0 or s.is_orderable)
    and (
      p_lat is null or pv.geog is null
      or st_dwithin(pv.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    )
  order by s.price asc
  limit p_limit;
$$;

-- ───────────────────────── Permisos de ejecución ─────────────────────────
grant execute on function public.accept_job_bid(uuid, uuid)            to authenticated;
grant execute on function public.create_project_invoice(uuid, numeric) to authenticated;
grant execute on function public.reserve_stock(uuid, uuid, numeric, uuid) to authenticated;
grant execute on function public.consume_stock(uuid)                   to authenticated;
grant execute on function public.release_stock(uuid)                   to authenticated;
grant execute on function public.return_surplus(uuid, uuid, numeric, text) to authenticated;

grant execute on function public.nearby_profiles(double precision, double precision, integer, text, integer)      to anon, authenticated;
grant execute on function public.nearby_providers(double precision, double precision, integer, text, integer)     to anon, authenticated;
grant execute on function public.nearby_job_posts(double precision, double precision, integer, text, integer)     to anon, authenticated;
grant execute on function public.match_elements(text, integer)                                                    to anon, authenticated;
grant execute on function public.element_comparables(uuid, double precision, double precision, integer, integer)  to anon, authenticated;
