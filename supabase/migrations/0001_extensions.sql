-- ═══════════════════════════════════════════════════════════════════
-- HomIA · FASE 1 — 0001 Extensiones
-- PostGIS (geolocalización) · pg_trgm (búsqueda difusa) · pgcrypto
-- Ejecutar en el SQL Editor de Supabase, en orden de prefijo.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists postgis     with schema extensions;
create extension if not exists pg_trgm     with schema extensions;
create extension if not exists pgcrypto    with schema extensions;
