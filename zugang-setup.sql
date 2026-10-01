-- ============================================================
-- Riedel-Tools – Zugang zur Startseite und allen Tools (Supabase)
-- Läuft im Supabase-Projekt riedel-stahllisten, eigene Tabelle
-- tools_zugang. Wer hier freigeschaltet ist, darf die Tools öffnen.
-- Projektbezogene Daten (Stahllisten, Bautagebuch) sieht man nur für
-- die Kostenstellen, für die man freigeschaltet ist (unten).
-- Doka-Mietrechnungen haben weiterhin eine eigene Freigabeliste.
--
-- Einmalig im Supabase SQL Editor ausführen. Das Skript kann
-- gefahrlos erneut ausgeführt werden.
-- ============================================================

create table if not exists public.tools_zugang (
  email       text primary key check (email = lower(email)),
  user_id     uuid unique,
  name        text,
  rolle       text not null default 'mitglied' check (rolle in ('admin','mitglied')),
  angelegt_am timestamptz not null default now()
);

-- Freigeschaltet wird ein bestehendes Konto (user_id), nicht nur eine
-- E-Mail-Adresse. So kann sich niemand nachträglich mit einer
-- freigeschalteten Adresse registrieren, die ihm nicht gehört.
create or replace function public.tools_zugang_konto()
returns trigger
language plpgsql security definer
set search_path = public, auth
as $$
begin
  new.email := lower(trim(new.email));
  select u.id into new.user_id from auth.users u where lower(u.email) = new.email;
  if new.user_id is null then
    raise exception 'Kein Konto mit der E-Mail % gefunden. Die Person muss sich zuerst auf der Startseite registrieren.', new.email
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists tools_zugang_konto on public.tools_zugang;
create trigger tools_zugang_konto before insert or update on public.tools_zugang
  for each row execute function public.tools_zugang_konto();

-- Rolle des angemeldeten Nutzers (null = kein Zugang).
create or replace function public.tools_meine_rolle()
returns text
language sql stable security definer
set search_path = public, auth
as $$
  select z.rolle
  from public.tools_zugang z
  join auth.users u on u.id = z.user_id
  where z.user_id = auth.uid()
    and u.email_confirmed_at is not null
$$;

create or replace function public.tools_berechtigt()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select public.tools_meine_rolle() is not null $$;

create or replace function public.tools_ist_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select coalesce(public.tools_meine_rolle() = 'admin', false) $$;

revoke all on function public.tools_meine_rolle()  from public, anon;
revoke all on function public.tools_berechtigt()   from public, anon;
revoke all on function public.tools_ist_admin()    from public, anon;
revoke all on function public.tools_zugang_konto() from public, anon;
grant execute on function public.tools_meine_rolle() to authenticated;
grant execute on function public.tools_berechtigt()  to authenticated;
grant execute on function public.tools_ist_admin()   to authenticated;

alter table public.tools_zugang enable row level security;
drop policy if exists "tools zugang lesen" on public.tools_zugang;
drop policy if exists "tools zugang admin" on public.tools_zugang;
create policy "tools zugang lesen" on public.tools_zugang
  for select to authenticated using (public.tools_berechtigt());
create policy "tools zugang admin" on public.tools_zugang
  for all to authenticated using (public.tools_ist_admin()) with check (public.tools_ist_admin());
revoke all on public.tools_zugang from anon;
grant select, insert, update, delete on public.tools_zugang to authenticated;

-- ---------- Ersten Admin freischalten ----------
-- insert into public.tools_zugang (email, name, rolle)
-- values ('vorname.nachname@firma.de', 'Vorname Nachname', 'admin')
-- on conflict (email) do update set rolle = 'admin';

-- ============================================================
-- Kostenstellen – Freigabe für projektbezogene Tools
-- (Stahllisten, Bautagebuch). Admins legen Kostenstellen an und
-- schalten Personen je Kostenstelle frei. Admins sehen alle.
-- ============================================================
create table if not exists public.kostenstellen (
  nr              text primary key check (nr = trim(nr) and nr <> ''),
  name            text not null,
  ort             text,
  lat             double precision,
  lon             double precision,
  telegram_chat_id text unique,
  aktiv           boolean not null default true,
  angelegt_am     timestamptz not null default now()
);

create table if not exists public.kostenstellen_zugang (
  kostenstelle text not null references public.kostenstellen(nr) on update cascade on delete cascade,
  email        text not null references public.tools_zugang(email) on update cascade on delete cascade,
  angelegt_am  timestamptz not null default now(),
  primary key (kostenstelle, email)
);

-- Darf der angemeldete Nutzer diese Kostenstelle sehen und bearbeiten?
-- Ohne Kostenstelle (null) nur Admins.
create or replace function public.tools_darf_kst(k text)
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select public.tools_ist_admin()
      or (k is not null and public.tools_berechtigt() and exists (
            select 1 from public.kostenstellen_zugang z
            join public.tools_zugang t on t.email = z.email
            where z.kostenstelle = k and t.user_id = auth.uid()))
$$;
revoke all on function public.tools_darf_kst(text) from public, anon;
grant execute on function public.tools_darf_kst(text) to authenticated;

-- Ort einer Kostenstelle (für das Wetter im Bautagebuch) – darf jede freigeschaltete Person setzen
create or replace function public.kst_ort_setzen(k text, p_ort text, p_lat double precision, p_lon double precision)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if not public.tools_darf_kst(k) then
    raise exception 'Keine Freigabe für Kostenstelle %', k using errcode = '42501';
  end if;
  update public.kostenstellen set ort = nullif(trim(p_ort), ''), lat = p_lat, lon = p_lon where nr = k;
end $$;
revoke all on function public.kst_ort_setzen(text, text, double precision, double precision) from public, anon;
grant execute on function public.kst_ort_setzen(text, text, double precision, double precision) to authenticated;

alter table public.kostenstellen enable row level security;
drop policy if exists "kst lesen" on public.kostenstellen;
drop policy if exists "kst admin" on public.kostenstellen;
create policy "kst lesen" on public.kostenstellen
  for select to authenticated using (public.tools_darf_kst(nr));
create policy "kst admin" on public.kostenstellen
  for all to authenticated using (public.tools_ist_admin()) with check (public.tools_ist_admin());
revoke all on public.kostenstellen from anon;
grant select, insert, update, delete on public.kostenstellen to authenticated;

alter table public.kostenstellen_zugang enable row level security;
drop policy if exists "kst zugang lesen" on public.kostenstellen_zugang;
drop policy if exists "kst zugang admin" on public.kostenstellen_zugang;
create policy "kst zugang lesen" on public.kostenstellen_zugang
  for select to authenticated using (public.tools_darf_kst(kostenstelle));
create policy "kst zugang admin" on public.kostenstellen_zugang
  for all to authenticated using (public.tools_ist_admin()) with check (public.tools_ist_admin());
revoke all on public.kostenstellen_zugang from anon;
grant select, insert, update, delete on public.kostenstellen_zugang to authenticated;
