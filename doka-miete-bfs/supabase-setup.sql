-- ============================================================
-- Doka-Mietrechnungen – Datenbank-Einrichtung (Supabase)
-- Läuft im selben Supabase-Projekt wie die Stahllisten
-- (riedel-stahllisten), aber mit eigenen Tabellen und eigener
-- Freigabeliste. Wer nur für die Stahllisten freigeschaltet ist,
-- sieht keine Doka-Daten und umgekehrt.
--
-- Einmalig im Supabase SQL Editor ausführen. Das Skript kann
-- gefahrlos erneut ausgeführt werden.
--
-- Zugriffsschutz:
--   * Nur angemeldete Nutzer, die in doka_zugang freigeschaltet
--     sind und ihre E-Mail bestätigt haben, sehen oder ändern Daten.
--   * Geprüft wird in der Datenbank (Row Level Security), nicht im
--     Browser – ein eigenes Konto allein reicht nicht.
-- ============================================================

-- ---------- Freigabeliste ----------
-- Freigeschaltet wird ein bestehendes Konto (user_id), nicht nur eine
-- E-Mail-Adresse. So kann sich niemand nachträglich mit einer
-- freigeschalteten Adresse registrieren, die ihm nicht gehört.
create table if not exists public.doka_zugang (
  email       text primary key check (email = lower(email)),
  user_id     uuid unique,
  name        text,
  rolle       text not null default 'mitglied' check (rolle in ('admin','mitglied')),
  angelegt_am timestamptz not null default now()
);

create or replace function public.doka_zugang_konto()
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
drop trigger if exists doka_zugang_konto on public.doka_zugang;
create trigger doka_zugang_konto before insert or update on public.doka_zugang
  for each row execute function public.doka_zugang_konto();

-- Rolle des angemeldeten Nutzers (null = kein Zugang).
-- security definer, damit die Prüfung auth.users lesen darf.
create or replace function public.doka_meine_rolle()
returns text
language sql stable security definer
set search_path = public, auth
as $$
  select z.rolle
  from public.doka_zugang z
  join auth.users u on u.id = z.user_id
  where z.user_id = auth.uid()
    and u.email_confirmed_at is not null
$$;

create or replace function public.doka_berechtigt()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select public.doka_meine_rolle() is not null $$;

create or replace function public.doka_ist_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select coalesce(public.doka_meine_rolle() = 'admin', false) $$;

revoke all on function public.doka_meine_rolle()  from public, anon;
revoke all on function public.doka_berechtigt()   from public, anon;
revoke all on function public.doka_ist_admin()    from public, anon;
revoke all on function public.doka_zugang_konto() from public, anon;
grant execute on function public.doka_meine_rolle() to authenticated;
grant execute on function public.doka_berechtigt()  to authenticated;
grant execute on function public.doka_ist_admin()   to authenticated;

alter table public.doka_zugang enable row level security;
drop policy if exists "doka zugang lesen" on public.doka_zugang;
drop policy if exists "doka zugang admin" on public.doka_zugang;
create policy "doka zugang lesen" on public.doka_zugang
  for select to authenticated using (public.doka_berechtigt());
create policy "doka zugang admin" on public.doka_zugang
  for all to authenticated using (public.doka_ist_admin()) with check (public.doka_ist_admin());
revoke all on public.doka_zugang from anon;
grant select, insert, update, delete on public.doka_zugang to authenticated;

-- ---------- Daten ----------
-- art 'stammdaten': eine Zeile (id 'stammdaten') mit Baustelle, Projekt,
--                   Kostenstelle, Lieferant, Kunden-Nr., Mietbeginn
-- art 'rechnung':   eine Zeile je Rechnung (id = Rechnungs-Nr.)
create table if not exists public.doka_daten (
  id            text primary key,
  art           text not null check (art in ('stammdaten','rechnung')),
  monat         text check (monat ~ '^\d{4}-\d{2}$'),
  data          jsonb not null,
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
-- Je Leistungsmonat höchstens eine Rechnung.
create unique index if not exists doka_daten_monat on public.doka_daten (monat) where art = 'rechnung';

create or replace function public.doka_stempel()
returns trigger language plpgsql as $$
begin
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  return new;
end $$;
drop trigger if exists doka_daten_stempel on public.doka_daten;
create trigger doka_daten_stempel before insert or update on public.doka_daten
  for each row execute function public.doka_stempel();

alter table public.doka_daten enable row level security;
drop policy if exists "doka daten team" on public.doka_daten;
create policy "doka daten team" on public.doka_daten
  for all to authenticated using (public.doka_berechtigt()) with check (public.doka_berechtigt());
revoke all on public.doka_daten from anon;
grant select, insert, update, delete on public.doka_daten to authenticated;

-- ---------- Ersten Admin freischalten ----------
-- Vorher im Tool ein Konto anlegen und die E-Mail bestätigen (ein
-- bestehendes Stahllisten-Konto funktioniert auch). Dann eigene E-Mail
-- eintragen und die folgenden Zeilen ausführen. Weitere Kollegen danach
-- im Tool unter „Zugänge“ freischalten.
-- insert into public.doka_zugang (email, name, rolle)
-- values ('vorname.nachname@firma.de', 'Vorname Nachname', 'admin')
-- on conflict (email) do update set rolle = 'admin';
