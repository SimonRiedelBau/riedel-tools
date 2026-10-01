-- ============================================================
-- Riedel-Tools – Projektablage (Supabase)
-- Läuft im Supabase-Projekt riedel-stahllisten. Voraussetzung:
-- zugang-setup.sql (Freigabeliste tools_zugang) ist eingerichtet.
--
-- Zugriff hat, wer für die Riedel-Tools freigeschaltet ist
-- (tools_berechtigt()). Geprüft wird in der Datenbank (Row Level
-- Security), nicht im Browser.
--
-- Einmalig im Supabase SQL Editor ausführen. Das Skript kann
-- gefahrlos erneut ausgeführt werden.
-- ============================================================

-- ---------- Dokumente je Projekt (Dateien und Links) ----------
create table if not exists public.projekt_dokumente (
  id           uuid primary key default gen_random_uuid(),
  projekt      text not null,
  rubrik       text not null default 'Sonstiges',
  titel        text not null check (length(titel) between 1 and 200),
  art          text not null check (art in ('datei','link')),
  url          text check (url is null or url ~* '^https?://'),
  pfad         text,
  dateiname    text,
  typ          text,
  groesse      bigint,
  notiz        text,
  angelegt_am  timestamptz not null default now(),
  angelegt_von uuid default auth.uid(),
  angelegt_mail text default (auth.jwt() ->> 'email'),
  check ((art = 'link' and url is not null) or (art = 'datei' and pfad is not null))
);
create index if not exists projekt_dokumente_projekt on public.projekt_dokumente (projekt);

alter table public.projekt_dokumente enable row level security;
drop policy if exists "projektablage team" on public.projekt_dokumente;
create policy "projektablage team" on public.projekt_dokumente
  for all to authenticated using (public.tools_berechtigt()) with check (public.tools_berechtigt());
revoke all on public.projekt_dokumente from anon;
grant select, insert, update, delete on public.projekt_dokumente to authenticated;

-- ---------- Dateien (privater Bucket, max. 50 MB je Datei) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('projektablage', 'projektablage', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "projektablage dateien lesen"   on storage.objects;
drop policy if exists "projektablage dateien anlegen" on storage.objects;
drop policy if exists "projektablage dateien loeschen" on storage.objects;
create policy "projektablage dateien lesen" on storage.objects
  for select to authenticated using (bucket_id = 'projektablage' and public.tools_berechtigt());
create policy "projektablage dateien anlegen" on storage.objects
  for insert to authenticated with check (bucket_id = 'projektablage' and public.tools_berechtigt());
create policy "projektablage dateien loeschen" on storage.objects
  for delete to authenticated using (bucket_id = 'projektablage' and public.tools_berechtigt());
