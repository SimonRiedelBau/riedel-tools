-- ============================================================
-- Riedel-Tools – EBV-Lieferscheine (Supabase)
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

-- ---------- Lieferscheine ----------
create table if not exists public.ebv_lieferscheine (
  id             uuid primary key default gen_random_uuid(),
  projekt        text not null,
  richtung       text not null check (richtung in ('anlieferung','abfuhr')),
  ls_nr          text,
  datum          date not null default current_date,
  lieferant      text,            -- Inverkehrbringer / Lieferant (bei Abfuhr: wir)
  abnehmer       text,            -- Verwender / Annahmestelle (bei Anlieferung: wir)
  befoerderer    text,
  kennzeichen    text,
  material       text,            -- Bezeichnung des Ersatzbaustoffs, z. B. „RC-Baustoff 0/45“
  materialklasse text,            -- z. B. RC-1, BM-0, BM-F2
  koernung       text,
  menge          numeric(12,3),
  einheit        text not null default 't' check (einheit in ('t','m³')),
  einbauort      text,            -- Anlieferung: Bauteil/Bereich; Abfuhr: Herkunft auf der Baustelle
  einbauweise    text,            -- Einbauweise nach EBV Anlage 2 (Nr.)
  ziel           text,            -- Abfuhr: Verwertungs- bzw. Entsorgungsstelle
  deckblatt      boolean not null default false,
  unterschrift   boolean not null default false,
  bemerkung      text,
  seiten         jsonb not null default '[]'::jsonb,  -- [{pfad, name, typ, groesse}]
  angelegt_am    timestamptz not null default now(),
  angelegt_von   uuid default auth.uid(),
  angelegt_mail  text default (auth.jwt() ->> 'email'),
  geaendert_am   timestamptz
);
create index if not exists ebv_lieferscheine_projekt on public.ebv_lieferscheine (projekt, datum desc);

alter table public.ebv_lieferscheine enable row level security;
drop policy if exists "ebv lieferscheine team" on public.ebv_lieferscheine;
create policy "ebv lieferscheine team" on public.ebv_lieferscheine
  for all to authenticated using (public.tools_berechtigt()) with check (public.tools_berechtigt());
revoke all on public.ebv_lieferscheine from anon;
grant select, insert, update, delete on public.ebv_lieferscheine to authenticated;

-- ---------- Fotos und PDFs (privater Bucket, max. 20 MB je Datei) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('ebv-lieferscheine', 'ebv-lieferscheine', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "ebv dateien lesen"    on storage.objects;
drop policy if exists "ebv dateien anlegen"  on storage.objects;
drop policy if exists "ebv dateien loeschen" on storage.objects;
create policy "ebv dateien lesen" on storage.objects
  for select to authenticated using (bucket_id = 'ebv-lieferscheine' and public.tools_berechtigt());
create policy "ebv dateien anlegen" on storage.objects
  for insert to authenticated with check (bucket_id = 'ebv-lieferscheine' and public.tools_berechtigt());
create policy "ebv dateien loeschen" on storage.objects
  for delete to authenticated using (bucket_id = 'ebv-lieferscheine' and public.tools_berechtigt());
