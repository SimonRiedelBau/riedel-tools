-- ============================================================
-- Bautagebuch – Datenbank-Einrichtung (Supabase-Projekt der Riedel-Tools)
-- Einmalig im Supabase SQL Editor ausführen – NACH ../zugang-setup.sql
-- (Riedel-Tools-Zugang und Kostenstellen). Kann gefahrlos erneut
-- ausgeführt werden.
--
-- Anmeldung wie bei allen Riedel-Tools. Projekte = Kostenstellen:
-- Man sieht nur Berichte der Kostenstellen, für die man freigeschaltet
-- ist (kostenstellen_zugang). Admins sehen alle.
-- ============================================================

create table if not exists public.bt_berichte (
  id                    uuid primary key default gen_random_uuid(),
  kostenstelle          text not null references public.kostenstellen(nr) on update cascade on delete cascade,
  blatt_nr              integer not null,
  datum                 date not null default current_date,
  arbeitszeit           text,
  temp_7h text, temp_12h text, temp_16h text, temp_max text, temp_min text,
  niederschlag          text,
  luftbewegung          text,
  ak_polier text, ak_werkpolier text, ak_vorarbeiter text, ak_maurer text, ak_zimmerer text,
  ak_betonbauer text, ak_helfer text, ak_maschinenpersonal text, ak_azubis text,
  g_raupen boolean default false,      g_raupen_anzahl numeric default 0,
  g_bagger boolean default false,      g_bagger_anzahl numeric default 0,
  g_kraene boolean default false,      g_kraene_anzahl numeric default 0,
  g_kompressor boolean default false,  g_kompressor_anzahl numeric default 0,
  g_verd_geraete boolean default false, g_verd_geraete_anzahl numeric default 0,
  g_lkw boolean default false,         g_lkw_anzahl numeric default 0,
  g_betonstahl boolean default false,  g_betonstahl_anzahl numeric default 0,
  g_beton boolean default false,       g_beton_anzahl numeric default 0,
  nachunternehmer       text,
  ausgefuehrte_arbeiten text,
  sonstiges             text,
  besuche_text          text,
  polier_name           text,
  bauleiter_name        text,
  bauherr_name          text,
  status                text not null default 'entwurf' check (status in ('entwurf','bestaetigt')),
  bestaetigt_am         timestamptz,
  fehlende_felder       jsonb,
  quelle                text,            -- z. B. 'telegram' oder 'uebernahme'
  erstellt_von          uuid default auth.uid(),
  erstellt_am           timestamptz not null default now(),
  geaendert_von         uuid,
  geaendert_am          timestamptz not null default now()
);
create index if not exists bt_berichte_kst on public.bt_berichte (kostenstelle, blatt_nr desc);
create index if not exists bt_berichte_datum on public.bt_berichte (datum desc);

create or replace function public.bt_stempel()
returns trigger language plpgsql as $$
begin
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  return new;
end $$;
drop trigger if exists bt_berichte_stempel on public.bt_berichte;
create trigger bt_berichte_stempel before update on public.bt_berichte
  for each row execute function public.bt_stempel();

alter table public.bt_berichte enable row level security;
drop policy if exists "bt berichte kostenstelle" on public.bt_berichte;
create policy "bt berichte kostenstelle" on public.bt_berichte
  for all to authenticated
  using (public.tools_darf_kst(kostenstelle))
  with check (public.tools_darf_kst(kostenstelle));
revoke all on public.bt_berichte from anon;
grant select, insert, update, delete on public.bt_berichte to authenticated;

-- Nachrichten aus den Telegram-Gruppen (schreibt nur der Bot mit dem Service-Schlüssel)
create table if not exists public.bt_telegram_nachrichten (
  id           bigint generated always as identity primary key,
  kostenstelle text not null references public.kostenstellen(nr) on update cascade on delete cascade,
  chat_id      text not null,
  absender     text,
  text         text,
  datum        date not null default current_date,
  zeitpunkt    timestamptz not null default now(),
  verarbeitet  boolean not null default false
);
alter table public.bt_telegram_nachrichten enable row level security;
drop policy if exists "bt telegram lesen" on public.bt_telegram_nachrichten;
create policy "bt telegram lesen" on public.bt_telegram_nachrichten
  for select to authenticated using (public.tools_darf_kst(kostenstelle));
revoke all on public.bt_telegram_nachrichten from anon;
grant select on public.bt_telegram_nachrichten to authenticated;
