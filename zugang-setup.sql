-- ============================================================
-- Riedel-Tools – Zugang zur Startseite und allen Tools (Supabase)
-- Läuft im Supabase-Projekt riedel-stahllisten, eigene Tabelle
-- tools_zugang. Wer hier freigeschaltet ist, darf die Tools öffnen.
-- Für die Daten von Stahllisten und Doka gilt zusätzlich die jeweils
-- eigene Freigabeliste (stahl_zugang, doka_zugang).
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
