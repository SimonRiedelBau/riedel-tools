-- ============================================================
-- Stahllisten – Datenbank-Einrichtung (Supabase)
-- Einmalig im Supabase SQL Editor ausführen – NACH ../zugang-setup.sql
-- (Riedel-Tools-Zugang und Kostenstellen). Kann gefahrlos erneut
-- ausgeführt werden.
--
-- Zugriffsschutz (geprüft in der Datenbank, Row Level Security):
--   * Anmeldung und Freischaltung wie bei allen Riedel-Tools (tools_zugang).
--   * Jedes Projekt gehört zu einer Kostenstelle. Man sieht nur Projekte
--     der Kostenstellen, für die man freigeschaltet ist
--     (kostenstellen_zugang). Admins sehen alle.
--   * Pläne/Listen liegen im privaten Storage-Bucket "stahllisten" und
--     sind nur lesbar, wenn das zugehörige Projekt sichtbar ist.
-- Die frühere eigene Freigabeliste stahl_zugang wird nicht mehr benutzt.
-- ============================================================

-- ---------- Daten (Projekte, Pläne, Stahllisten, Bestellungen) ----------
create table if not exists public.stahl_objekte (
  id           text primary key,
  art          text not null check (art in ('projekt','plan','liste','bestellung')),
  projekt_id   text not null,
  data         jsonb not null,
  geaendert_am timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
create index if not exists stahl_objekte_projekt on public.stahl_objekte (projekt_id);

create or replace function public.stahl_stempel()
returns trigger language plpgsql as $$
begin
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  return new;
end $$;
drop trigger if exists stahl_objekte_stempel on public.stahl_objekte;
create trigger stahl_objekte_stempel before insert or update on public.stahl_objekte
  for each row execute function public.stahl_stempel();

-- Kostenstelle je Zeile (Projekt und alle Pläne/Listen/Bestellungen des Projekts)
alter table public.stahl_objekte add column if not exists kostenstelle text
  references public.kostenstellen(nr) on update cascade on delete set null;
create index if not exists stahl_objekte_kst on public.stahl_objekte (kostenstelle);
create index if not exists stahl_objekte_datei on public.stahl_objekte ((data->>'fileId'));

-- Bestehende Projekte übernehmen: Kostenstellen aus dem Feld „Kostenstelle“ der Projekte anlegen
-- und allen Zeilen des Projekts zuordnen. Projekte ohne Kostenstelle sehen nur Admins,
-- bis ihnen im Tool eine Kostenstelle zugewiesen wird.
insert into public.kostenstellen (nr, name)
select distinct on (trim(o.data->>'kst')) trim(o.data->>'kst'), coalesce(nullif(o.data->>'name', ''), trim(o.data->>'kst'))
from public.stahl_objekte o
where o.art = 'projekt' and coalesce(trim(o.data->>'kst'), '') <> ''
on conflict (nr) do nothing;
update public.stahl_objekte o
set kostenstelle = trim(p.data->>'kst')
from public.stahl_objekte p
where p.art = 'projekt' and p.id = o.projekt_id
  and coalesce(trim(p.data->>'kst'), '') <> '' and o.kostenstelle is null;

alter table public.stahl_objekte enable row level security;
drop policy if exists "objekte team" on public.stahl_objekte;
drop policy if exists "objekte kostenstelle" on public.stahl_objekte;
create policy "objekte kostenstelle" on public.stahl_objekte
  for all to authenticated
  using (public.tools_darf_kst(kostenstelle))
  with check (public.tools_darf_kst(kostenstelle));
revoke all on public.stahl_objekte from anon;
grant select, insert, update, delete on public.stahl_objekte to authenticated;

-- ---------- Dateien (privater Bucket) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('stahllisten', 'stahllisten', false, 52428800)
on conflict (id) do update set public = false;

drop policy if exists "stahllisten dateien lesen"   on storage.objects;
drop policy if exists "stahllisten dateien anlegen" on storage.objects;
drop policy if exists "stahllisten dateien aendern" on storage.objects;
drop policy if exists "stahllisten dateien loeschen" on storage.objects;
-- Lesen/Ändern/Löschen nur, wenn die Datei zu einem sichtbaren Plan bzw. einer sichtbaren Liste gehört
-- (die Abfrage auf stahl_objekte unterliegt selbst der Kostenstellen-Regel). Hochladen darf jede
-- freigeschaltete Person; die Datei wird erst danach einem Plan oder einer Liste zugeordnet.
create policy "stahllisten dateien lesen" on storage.objects
  for select to authenticated using (bucket_id = 'stahllisten' and (public.tools_ist_admin()
    or exists (select 1 from public.stahl_objekte o where o.data->>'fileId' = storage.objects.name)));
create policy "stahllisten dateien anlegen" on storage.objects
  for insert to authenticated with check (bucket_id = 'stahllisten' and public.tools_berechtigt());
create policy "stahllisten dateien aendern" on storage.objects
  for update to authenticated using (bucket_id = 'stahllisten' and (public.tools_ist_admin()
    or exists (select 1 from public.stahl_objekte o where o.data->>'fileId' = storage.objects.name)))
  with check (bucket_id = 'stahllisten' and public.tools_berechtigt());
create policy "stahllisten dateien loeschen" on storage.objects
  for delete to authenticated using (bucket_id = 'stahllisten' and (public.tools_ist_admin()
    or exists (select 1 from public.stahl_objekte o where o.data->>'fileId' = storage.objects.name)));

-- ---------- Freischalten ----------
-- Personen und Kostenstellen verwaltet ein Admin auf der Startseite der
-- Riedel-Tools unter „Zugänge“.
