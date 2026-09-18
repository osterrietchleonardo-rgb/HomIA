-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0014 Mensajería directa (bandeja + chat 1:1)
-- · conversations: hilo 1:1 entre cualquier par de usuarios
--   (cliente/profesional/proveedor). Par normalizado (a_id < b_id)
--   para unicidad en ambas direcciones.
-- · messages: burbujas de texto con acuse de lectura (read_at).
--   Al enviarse se notifica al destinatario (link /mensajes?c=conv).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a_id       uuid not null references public.profiles (id) on delete cascade,
  user_b_id       uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  check (user_a_id < user_b_id),
  unique (user_a_id, user_b_id)
);

create index conversations_user_b on public.conversations (user_b_id, last_message_at desc);
create index conversations_user_a on public.conversations (user_a_id, last_message_at desc);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index messages_conversation on public.messages (conversation_id, created_at);
create index messages_unread on public.messages (conversation_id)
  where read_at is null;
