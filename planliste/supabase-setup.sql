-- ============================================================
-- Riedel-Tools – Planliste (Supabase)
-- Läuft im Supabase-Projekt riedel-stahllisten. Voraussetzung:
-- zugang-setup.sql (Freigabeliste tools_zugang) ist eingerichtet.
--
-- Je Projekt und Plan-Nr. gibt es genau eine Zeile mit dem
-- aktuellen Index. Kommt ein neuer Index, wird die Zeile
-- überschrieben, die alte Datei gelöscht und der alte Stand nur
-- noch im Verlauf (jsonb) festgehalten.
--
-- Zugriff hat, wer für die Riedel-Tools freigeschaltet ist
-- (tools_berechtigt()). Geprüft wird in der Datenbank (Row Level
-- Security), nicht im Browser.
--
-- Einmalig im Supabase SQL Editor ausführen. Das Skript kann
-- gefahrlos erneut ausgeführt werden.
-- ============================================================

create table if not exists public.plan_plaene (
  id               uuid primary key default gen_random_uuid(),
  projekt          text not null,
  nr               text not null,            -- Plan-Nr. ohne Index und Planstand, z. B. BP041
  idx              text not null default '', -- Index, z. B. 00, 01, 0, a, b
  stand            text not null default '' check (stand in ('','V','F')), -- V = Vorabzug, F = Freigabe, '' = offen
  art              text not null default '', -- Planart, z. B. BP (Bewehrungsplan), SP (Schalplan)
  bereich          text not null default '', -- Bauteil · Ebene, z. B. „Bauteil B · 1. UG“
  titel            text not null default '',
  datei_pfad       text,
  datei_name       text,
  datei_groesse    bigint,
  datei_typ        text,
  hochgeladen_am   timestamptz not null default now(),
  hochgeladen_mail text default (auth.jwt() ->> 'email'),
  verlauf          jsonb not null default '[]'::jsonb, -- frühere Indizes [{idx, stand, datei_name, hochgeladen_am, hochgeladen_mail, ersetzt_am, ersetzt_mail}]
  angelegt_am      timestamptz not null default now(),
  geaendert_am     timestamptz,
  unique (projekt, nr)
);
create index if not exists plan_plaene_projekt on public.plan_plaene (projekt, art, nr);

alter table public.plan_plaene enable row level security;
drop policy if exists "plan plaene team" on public.plan_plaene;
create policy "plan plaene team" on public.plan_plaene
  for all to authenticated using (public.tools_berechtigt()) with check (public.tools_berechtigt());
revoke all on public.plan_plaene from anon;
grant select, insert, update, delete on public.plan_plaene to authenticated;

-- ---------- Plandateien (privater Bucket, max. 50 MB je Datei) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('planliste', 'planliste', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "planliste dateien lesen"    on storage.objects;
drop policy if exists "planliste dateien anlegen"  on storage.objects;
drop policy if exists "planliste dateien loeschen" on storage.objects;
create policy "planliste dateien lesen" on storage.objects
  for select to authenticated using (bucket_id = 'planliste' and public.tools_berechtigt());
create policy "planliste dateien anlegen" on storage.objects
  for insert to authenticated with check (bucket_id = 'planliste' and public.tools_berechtigt());
create policy "planliste dateien loeschen" on storage.objects
  for delete to authenticated using (bucket_id = 'planliste' and public.tools_berechtigt());
