-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0015 Confianza: reseñas con fotos, verificación
--   de identidad por DNI con IA, y regla "el cliente escribe primero".
-- · reviews.photos: array JSON de URLs que avalan cada reseña.
-- · identity_documents: dictamen del modelo de IA de visión
--   (ai_verdict JSON, ai_score 0..1, ai_notes).
-- · profiles.verification_status: none | en_revision | verificado |
--   rechazado — estado PÚBLICO que se muestra junto al nombre.
--   Quien no sube DNI queda "no verificado" para todos.
-- ═══════════════════════════════════════════════════════════════════

alter table public.reviews
  add column if not exists photos text not null default '[]';

alter table public.identity_documents
  add column if not exists ai_verdict jsonb,
  add column if not exists ai_score double precision,
  add column if not exists ai_notes text;

-- la subida pasa directo a análisis de IA
alter table public.identity_documents
  drop constraint if exists identity_documents_status_check;
alter table public.identity_documents
  add constraint identity_documents_status_check
  check (status in ('en_revision', 'verificado', 'rechazado'));

alter table public.profiles
  add column if not exists verification_status text not null default 'none';
alter table public.profiles
  add column if not exists verified_at timestamptz;

-- Índices de consulta pública
create index if not exists reviews_target_created on public.reviews (target_user_id, created_at desc);
create index if not exists identity_documents_user on public.identity_documents (user_id, created_at desc);
