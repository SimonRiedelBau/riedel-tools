-- ============================================================
-- Riedel-Tools – Baustelle 4D: gemeinsamer Stand je Projekt (Supabase)
-- Läuft im Supabase-Projekt riedel-stahllisten. Voraussetzung:
-- zugang-setup.sql (Freigabeliste tools_zugang) ist eingerichtet.
--
-- b4d_projekte  ein Eintrag je Projekt mit Verweis auf das IFC-Modell
-- b4d_daten     je Datensatz eine Zeile: Ablauf (plan), Bauteilstatus,
--               Zusagen, Hindernisse, Mängel, Tagebucheinträge
-- baustelle-4d  privater Bucket für IFC-Modelle und Tagebuchfotos
--
-- Zugriff hat, wer für die Riedel-Tools freigeschaltet ist
-- (tools_berechtigt()). Projekte löschen dürfen nur Admins.
-- Geprüft wird in der Datenbank (Row Level Security).
--
-- Einmalig im Supabase SQL Editor ausführen. Das Skript kann
-- gefahrlos erneut ausgeführt werden.
-- ============================================================

-- ---------- Projekte ----------
create table if not exists public.b4d_projekte (
  id            text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  name          text not null check (length(name) between 1 and 120),
  ifc_pfad      text,
  ifc_name      text,
  ifc_groesse   bigint,
  angelegt_am   timestamptz not null default now(),
  angelegt_von  uuid default auth.uid(),
  angelegt_mail text default (auth.jwt() ->> 'email'),
  geaendert_am  timestamptz not null default now()
);

-- ---------- Datensätze ----------
create table if not exists public.b4d_daten (
  projekt        text not null references public.b4d_projekte(id) on delete cascade,
  art            text not null check (art in ('plan','bauteil','zusage','hindernis','mangel','tagebuch')),
  id             text not null check (length(id) between 1 and 100),
  daten          jsonb not null default '{}'::jsonb,
  geloescht      boolean not null default false,
  version        bigint not null default 1,
  client         text,
  geaendert_am   timestamptz not null default now(),
  geaendert_von  uuid default auth.uid(),
  geaendert_mail text default (auth.jwt() ->> 'email'),
  primary key (projekt, art, id)
);
create index if not exists b4d_daten_projekt on public.b4d_daten (projekt);

-- Zeitstempel und Bearbeiter setzt die Datenbank, nicht der Browser
create or replace function public.b4d_stempel()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  new.geaendert_am   := now();
  new.geaendert_von  := auth.uid();
  new.geaendert_mail := auth.jwt() ->> 'email';
  update public.b4d_projekte set geaendert_am = now()
   where id = new.projekt and geaendert_am < now() - interval '1 minute';
  return new;
end $$;
drop trigger if exists b4d_stempel on public.b4d_daten;
create trigger b4d_stempel before insert or update on public.b4d_daten
  for each row execute function public.b4d_stempel();

create or replace function public.b4d_projekt_stempel()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  new.geaendert_am := now();
  if tg_op = 'INSERT' then
    new.angelegt_am := now(); new.angelegt_von := auth.uid(); new.angelegt_mail := auth.jwt() ->> 'email';
  else
    new.angelegt_am := old.angelegt_am; new.angelegt_von := old.angelegt_von; new.angelegt_mail := old.angelegt_mail;
  end if;
  return new;
end $$;
drop trigger if exists b4d_projekt_stempel on public.b4d_projekte;
create trigger b4d_projekt_stempel before insert or update on public.b4d_projekte
  for each row execute function public.b4d_projekt_stempel();

-- ---------- Zugriffsregeln ----------
alter table public.b4d_projekte enable row level security;
drop policy if exists "b4d projekte lesen"    on public.b4d_projekte;
drop policy if exists "b4d projekte anlegen"  on public.b4d_projekte;
drop policy if exists "b4d projekte aendern"  on public.b4d_projekte;
drop policy if exists "b4d projekte loeschen" on public.b4d_projekte;
create policy "b4d projekte lesen"    on public.b4d_projekte for select to authenticated using (public.tools_berechtigt());
create policy "b4d projekte anlegen"  on public.b4d_projekte for insert to authenticated with check (public.tools_berechtigt());
create policy "b4d projekte aendern"  on public.b4d_projekte for update to authenticated using (public.tools_berechtigt()) with check (public.tools_berechtigt());
create policy "b4d projekte loeschen" on public.b4d_projekte for delete to authenticated using (public.tools_ist_admin());
revoke all on public.b4d_projekte from anon;
grant select, insert, update, delete on public.b4d_projekte to authenticated;

alter table public.b4d_daten enable row level security;
drop policy if exists "b4d daten team" on public.b4d_daten;
create policy "b4d daten team" on public.b4d_daten
  for all to authenticated using (public.tools_berechtigt()) with check (public.tools_berechtigt());
revoke all on public.b4d_daten from anon;
grant select, insert, update, delete on public.b4d_daten to authenticated;

-- Live-Abgleich: andere geöffnete Geräte bekommen Änderungen sofort mit
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'b4d_daten') then
    alter publication supabase_realtime add table public.b4d_daten;
  end if;
end $$;

-- ---------- IFC-Modelle und Fotos (privater Bucket, max. 50 MB je Datei) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('baustelle-4d', 'baustelle-4d', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "b4d dateien lesen"    on storage.objects;
drop policy if exists "b4d dateien anlegen"  on storage.objects;
drop policy if exists "b4d dateien aendern"  on storage.objects;
drop policy if exists "b4d dateien loeschen" on storage.objects;
create policy "b4d dateien lesen"    on storage.objects for select to authenticated using (bucket_id = 'baustelle-4d' and public.tools_berechtigt());
create policy "b4d dateien anlegen"  on storage.objects for insert to authenticated with check (bucket_id = 'baustelle-4d' and public.tools_berechtigt());
create policy "b4d dateien aendern"  on storage.objects for update to authenticated using (bucket_id = 'baustelle-4d' and public.tools_berechtigt()) with check (bucket_id = 'baustelle-4d' and public.tools_berechtigt());
create policy "b4d dateien loeschen" on storage.objects for delete to authenticated using (bucket_id = 'baustelle-4d' and public.tools_ist_admin());
