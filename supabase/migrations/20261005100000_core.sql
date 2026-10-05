-- Bharat Pulse core schema: events, AI briefs, watchlists and alerts.
-- Keep the CHECK lists in sync with SOURCES / CATEGORIES in lib/types.ts.

create table public.events (
  id           bigint generated always as identity primary key,
  source       text not null check (source in ('sachet','ncs','firms','aqi','pib','news','sports')),
  external_id  text not null,
  title        text not null,
  summary      text,
  category     text not null check (category in
                 ('flood','cyclone','weather','heat','earthquake','wildfire','air','health','security',
                  'civic','infrastructure','transport','politics','economy','sports','other')),
  severity     smallint not null check (severity between 1 and 5),
  lat          double precision check (lat between -90 and 90),
  lng          double precision check (lng between -180 and 180),
  state        text check (state ~ '^IN-[A-Z]{2}$'),   -- ISO 3166-2:IN
  district     text,
  lang         text not null default 'en' check (lang ~ '^[a-z]{2,3}$'),
  title_en     text,                                   -- machine translations (lib/i18n)
  title_hi     text,
  url          text,
  occurred_at  timestamptz not null,
  raw          jsonb,
  created_at   timestamptz not null default now(),
  unique (source, external_id)
);
create index events_occurred_at_idx on public.events (occurred_at desc);
create index events_category_idx    on public.events (category, occurred_at desc);
create index events_state_idx       on public.events (state, occurred_at desc);
create index events_untranslated_idx on public.events (created_at desc) where title_en is null or title_hi is null;

-- A re-ingested item whose headline changed must be re-translated.
create or replace function public.events_reset_translations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.title is distinct from old.title then
    new.title_en := null;
    new.title_hi := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.events_reset_translations() from public, anon, authenticated;
create trigger events_reset_translations
  before update on public.events
  for each row execute function public.events_reset_translations();

create table public.briefs (
  id           bigint generated always as identity primary key,
  scope        text not null,             -- 'india' or a state code
  period_start timestamptz not null,
  period_end   timestamptz not null,
  content      text not null,
  content_hi   text,
  model        text,
  created_at   timestamptz not null default now(),
  unique (scope, period_start)
);

create table public.watchlists (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  states       text[] not null default '{}' check (cardinality(states) <= 36),
  categories   text[] not null default '{}' check (categories <@ array
                 ['flood','cyclone','weather','heat','earthquake','wildfire','air','health','security',
                  'civic','infrastructure','transport','politics','economy','sports','other']::text[]),
  keywords     text[] not null default '{}' check (cardinality(keywords) <= 20),
  min_severity smallint not null default 1 check (min_severity between 1 and 5),
  created_at   timestamptz not null default now()
);
create index watchlists_user_idx on public.watchlists (user_id);

create table public.alerts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users on delete cascade,
  watchlist_id bigint not null references public.watchlists on delete cascade,
  event_id     bigint not null references public.events on delete cascade,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (watchlist_id, event_id)
);
create index alerts_user_idx on public.alerts (user_id, created_at desc);
create index alerts_user_unread_idx on public.alerts (user_id) where read_at is null;
create index alerts_event_idx on public.alerts (event_id);

-- ---------- Row Level Security ----------
alter table public.events     enable row level security;
alter table public.briefs     enable row level security;
alter table public.watchlists enable row level security;
alter table public.alerts     enable row level security;

-- Public read; writes only via the service role (which bypasses RLS).
create policy "events are public" on public.events for select using (true);
create policy "briefs are public" on public.briefs for select using (true);

create policy "own watchlists" on public.watchlists for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "read own alerts" on public.alerts for select
  using ((select auth.uid()) = user_id);
create policy "mark own alerts read" on public.alerts for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke insert, update, delete on public.events, public.briefs from anon, authenticated;
-- Users may only flip read_at on their own alerts (RLS limits rows; this limits columns).
revoke update on public.alerts from anon, authenticated;
grant update (read_at) on public.alerts to authenticated;

-- ---------- Watchlist abuse limits ----------
-- Enforced in the database because the anon key is public: a signed-in user can call
-- PostgREST directly and bypass the Server Action's zod schema.
create or replace function public.enforce_watchlist_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from pg_catalog.unnest(new.keywords) as k(kw)
             where pg_catalog.char_length(k.kw) not between 2 and 60) then
    raise exception 'keywords must be 2-60 characters' using errcode = 'check_violation';
  end if;
  if exists (select 1 from pg_catalog.unnest(new.states) as s(code) where s.code !~ '^IN-[A-Z]{2}$') then
    raise exception 'states must be ISO 3166-2:IN codes like IN-KA' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT'
     and (select count(*) from public.watchlists w where w.user_id = new.user_id) >= 20 then
    raise exception 'watchlist limit reached (20)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_watchlist_limits() from public, anon, authenticated;
create trigger watchlists_enforce_limits
  before insert or update on public.watchlists
  for each row execute function public.enforce_watchlist_limits();

-- ---------- Watchlist alerts ----------
-- Every new event is matched against all watchlists. Mirrors lib/watchlists/match.ts
-- (eventMatchesWatchlist) — keep the two in sync.
create or replace function public.create_watchlist_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.alerts (user_id, watchlist_id, event_id)
  select w.user_id, w.id, new.id
  from public.watchlists as w
  where new.severity >= w.min_severity
    and (pg_catalog.cardinality(w.states) = 0 or new.state = any (w.states))
    and (pg_catalog.cardinality(w.categories) = 0 or new.category = any (w.categories))
    and (
      pg_catalog.cardinality(w.keywords) = 0
      or exists (
        select 1
        from pg_catalog.unnest(w.keywords) as k(kw)
        -- Escape LIKE metacharacters (\ % _) so keywords match literally.
        cross join lateral (
          select '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
                   k.kw, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
        ) as p
        where new.title ilike p.pattern
           or coalesce(new.summary, '') ilike p.pattern
      )
    )
  on conflict (watchlist_id, event_id) do nothing;
  return null;
exception
  -- Never let alert fan-out break event ingestion.
  when others then
    raise warning 'create_watchlist_alerts failed for event %: %', new.id, sqlerrm;
    return null;
end;
$$;
revoke execute on function public.create_watchlist_alerts() from public, anon, authenticated;

-- Runs after the geo trigger (20261005110000_geo.sql) has filled `state`: AFTER triggers
-- see the row as finally inserted.
create trigger events_create_watchlist_alerts
  after insert on public.events
  for each row execute function public.create_watchlist_alerts();

-- Live updates to the map/feed and the alert badge (RLS still applies to Realtime).
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.alerts;
