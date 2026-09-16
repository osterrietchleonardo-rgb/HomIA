-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0010 Storage: buckets y políticas
-- Buckets públicos: avatars, job-photos, work-photos
-- Buckets privados: dni-docs (solo dueño), invoices (solo dueño;
--   el cliente accede vía backend con service role)
-- Convención de carpetas: {profile_id}/archivo.ext
-- ═══════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values
  ('avatars',     'avatars',     true),
  ('job-photos',  'job-photos',  true),
  ('work-photos', 'work-photos', true),
  ('dni-docs',    'dni-docs',    false),
  ('invoices',    'invoices',    false)
on conflict (id) do nothing;

-- ── Lectura pública de medios ──
create policy "media_public_read" on storage.objects
  for select
  using (bucket_id in ('avatars', 'job-photos', 'work-photos'));

-- ── Escritura de medios: cada perfil escribe en SU carpeta ──
create policy "media_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'job-photos', 'work-photos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "media_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'job-photos', 'work-photos')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('avatars', 'job-photos', 'work-photos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "media_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'job-photos', 'work-photos')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── DNI: privado, solo el dueño ──
create policy "dni_select_owner" on storage.objects
  for select to authenticated
  using (bucket_id = 'dni-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "dni_insert_owner" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dni-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "dni_update_owner" on storage.objects
  for update to authenticated
  using (bucket_id = 'dni-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'dni-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "dni_delete_owner" on storage.objects
  for delete to authenticated
  using (bucket_id = 'dni-docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Facturas: privado, solo el profesional las sube/gestiona ──
create policy "invoices_select_owner" on storage.objects
  for select to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "invoices_insert_owner" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "invoices_update_owner" on storage.objects
  for update to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "invoices_delete_owner" on storage.objects
  for delete to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
