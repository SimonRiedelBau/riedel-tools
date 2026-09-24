-- ============================================================
-- Stahllisten – Datenbank-Einrichtung (Supabase)
-- Einmalig im Supabase SQL Editor ausführen. Das Skript kann
-- gefahrlos erneut ausgeführt werden.
--
-- Zugriffsschutz:
--   * Nur angemeldete Nutzer, deren E-Mail in stahl_zugang
--     freigeschaltet UND bestätigt ist, sehen oder ändern Daten.
--   * Geprüft wird in der Datenbank (Row Level Security), nicht im
--     Browser – ein eigenes Konto allein reicht nicht.
--   * Pläne/Listen liegen im privaten Storage-Bucket "stahllisten".
-- ============================================================

-- ---------- Freigabeliste ----------
-- Freigeschaltet wird ein bestehendes Konto (user_id), nicht nur eine
-- E-Mail-Adresse. So kann sich niemand nachträglich mit einer
-- freigeschalteten Adresse registrieren, die ihm nicht gehört.
create table if not exists public.stahl_zugang (
  email       text primary key check (email = lower(email)),
  user_id     uuid unique,
  name        text,
  rolle       text not null default 'mitglied' check (rolle in ('admin','mitglied')),
  angelegt_am timestamptz not null default now()
);
alter table public.stahl_zugang add column if not exists user_id uuid unique;

create or replace function public.stahl_zugang_konto()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
begin
  new.email := lower(trim(new.email));
  select u.id into new.user_id from auth.users u where lower(u.email) = new.email;
  if new.user_id is null then
    raise exception 'Kein Konto mit der E-Mail % gefunden. Die Person muss sich zuerst im Tool registrieren.', new.email
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists stahl_zugang_konto on public.stahl_zugang;
create trigger stahl_zugang_konto before insert or update on public.stahl_zugang
  for each row execute function public.stahl_zugang_konto();

-- Rolle des angemeldeten Nutzers (null = kein Zugang).
-- security definer, damit die Prüfung auth.users lesen darf.
create or replace function public.stahl_meine_rolle()
returns text
language sql stable security definer
set search_path = public, auth
as $$
  select z.rolle
  from public.stahl_zugang z
  join auth.users u on u.id = z.user_id
  where z.user_id = auth.uid()
    and u.email_confirmed_at is not null
$$;

create or replace function public.stahl_berechtigt()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select public.stahl_meine_rolle() is not null $$;

create or replace function public.stahl_ist_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select coalesce(public.stahl_meine_rolle() = 'admin', false) $$;

revoke all on function public.stahl_meine_rolle() from public, anon;
revoke all on function public.stahl_berechtigt()  from public, anon;
revoke all on function public.stahl_ist_admin()   from public, anon;
revoke all on function public.stahl_zugang_konto() from public, anon;
grant execute on function public.stahl_meine_rolle() to authenticated;
grant execute on function public.stahl_berechtigt()  to authenticated;
grant execute on function public.stahl_ist_admin()   to authenticated;

alter table public.stahl_zugang enable row level security;
drop policy if exists "zugang lesen"   on public.stahl_zugang;
drop policy if exists "zugang admin"   on public.stahl_zugang;
create policy "zugang lesen" on public.stahl_zugang
  for select to authenticated using (public.stahl_berechtigt());
create policy "zugang admin" on public.stahl_zugang
  for all to authenticated using (public.stahl_ist_admin()) with check (public.stahl_ist_admin());
revoke all on public.stahl_zugang from anon;
grant select, insert, update, delete on public.stahl_zugang to authenticated;

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

alter table public.stahl_objekte enable row level security;
drop policy if exists "objekte team" on public.stahl_objekte;
create policy "objekte team" on public.stahl_objekte
  for all to authenticated using (public.stahl_berechtigt()) with check (public.stahl_berechtigt());
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
create policy "stahllisten dateien lesen" on storage.objects
  for select to authenticated using (bucket_id = 'stahllisten' and public.stahl_berechtigt());
create policy "stahllisten dateien anlegen" on storage.objects
  for insert to authenticated with check (bucket_id = 'stahllisten' and public.stahl_berechtigt());
create policy "stahllisten dateien aendern" on storage.objects
  for update to authenticated using (bucket_id = 'stahllisten' and public.stahl_berechtigt())
  with check (bucket_id = 'stahllisten' and public.stahl_berechtigt());
create policy "stahllisten dateien loeschen" on storage.objects
  for delete to authenticated using (bucket_id = 'stahllisten' and public.stahl_berechtigt());

-- ---------- Ersten Admin freischalten ----------
-- Vorher im Tool ein Konto anlegen und die E-Mail bestätigen.
-- Dann eigene E-Mail eintragen und die folgenden Zeilen ausführen.
-- Weitere Kollegen danach im Tool unter „Zugänge“ freischalten.
-- insert into public.stahl_zugang (email, name, rolle)
-- values ('vorname.nachname@firma.de', 'Vorname Nachname', 'admin')
-- on conflict (email) do update set rolle = 'admin';
