-- ============================================================
-- Riedel-Tools – Aushub 3D: gemeinsamer Stand je Projekt (Supabase)
-- Läuft im Supabase-Projekt riedel-stahllisten. Voraussetzung:
-- zugang-setup.sql (Freigabeliste tools_zugang) ist eingerichtet.
--
-- Gespeichert werden geänderte Sohlhöhen, eigene Flächen, Linienhöhen,
-- Geländehöhe und der hinterlegte Plan. Alle für die Riedel-Tools
-- Freigeschalteten (tools_berechtigt()) sehen und bearbeiten denselben
-- Stand. Geprüft wird in der Datenbank (Row Level Security).
--
-- Einmalig im Supabase SQL Editor ausführen. Das Skript kann
-- gefahrlos erneut ausgeführt werden.
-- ============================================================

-- ---------- Stand je Projekt ----------
create table if not exists public.aushub_stand (
  projekt        text primary key check (length(projekt) between 1 and 100),
  daten          jsonb not null default '{}'::jsonb,
  version        bigint not null default 1,
  geaendert_am   timestamptz not null default now(),
  geaendert_von  uuid default auth.uid(),
  geaendert_mail text default (auth.jwt() ->> 'email')
);

-- Zeitstempel und Bearbeiter setzt die Datenbank, nicht der Browser
create or replace function public.aushub_stand_stempel()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  new.geaendert_am   := now();
  new.geaendert_von  := auth.uid();
  new.geaendert_mail := auth.jwt() ->> 'email';
  return new;
end $$;
drop trigger if exists aushub_stand_stempel on public.aushub_stand;
create trigger aushub_stand_stempel before insert or update on public.aushub_stand
  for each row execute function public.aushub_stand_stempel();

alter table public.aushub_stand enable row level security;
drop policy if exists "aushub stand team" on public.aushub_stand;
create policy "aushub stand team" on public.aushub_stand
  for all to authenticated using (public.tools_berechtigt()) with check (public.tools_berechtigt());
revoke all on public.aushub_stand from anon;
grant select, insert, update, delete on public.aushub_stand to authenticated;

-- Live-Aktualisierung: andere geöffnete Geräte bekommen Änderungen sofort mit
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aushub_stand') then
    alter publication supabase_realtime add table public.aushub_stand;
  end if;
end $$;

-- ---------- Hinterlegte Pläne (privater Bucket, max. 20 MB je Datei) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('aushub-plaene', 'aushub-plaene', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "aushub plaene lesen"    on storage.objects;
drop policy if exists "aushub plaene anlegen"  on storage.objects;
drop policy if exists "aushub plaene loeschen" on storage.objects;
create policy "aushub plaene lesen" on storage.objects
  for select to authenticated using (bucket_id = 'aushub-plaene' and public.tools_berechtigt());
create policy "aushub plaene anlegen" on storage.objects
  for insert to authenticated with check (bucket_id = 'aushub-plaene' and public.tools_berechtigt());
create policy "aushub plaene loeschen" on storage.objects
  for delete to authenticated using (bucket_id = 'aushub-plaene' and public.tools_berechtigt());
