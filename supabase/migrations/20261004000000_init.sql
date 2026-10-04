-- Core schema for Pulse.

create table public.events (
  id           bigint generated always as identity primary key,
  source       text not null check (source in ('usgs','eonet','gdelt','rss')),
  external_id  text not null,
  title        text not null,
  summary      text,
  category     text not null check (category in
                 ('earthquake','wildfire','storm','volcano','flood','conflict','politics','economy','health','other')),
  severity     smallint not null check (severity between 1 and 5),
  lat          double precision check (lat between -90 and 90),
  lng          double precision check (lng between -180 and 180),
  country      text,
  url          text,
  occurred_at  timestamptz not null,
  raw          jsonb,
  created_at   timestamptz not null default now(),
  unique (source, external_id)
);
create index events_occurred_at_idx on public.events (occurred_at desc);
create index events_category_idx on public.events (category, occurred_at desc);
create index events_country_idx on public.events (country, occurred_at desc);

create table public.briefs (
  id          bigint generated always as identity primary key,
  scope       text not null,             -- 'world' or ISO country code
  period_start timestamptz not null,
  period_end   timestamptz not null,
  content     text not null,
  model       text,
  created_at  timestamptz not null default now(),
  unique (scope, period_start)
);

create table public.watchlists (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null,
  countries   text[] not null default '{}',
  categories  text[] not null default '{}',
  keywords    text[] not null default '{}',
  min_severity smallint not null default 1 check (min_severity between 1 and 5),
  created_at  timestamptz not null default now()
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

-- Row Level Security
alter table public.events     enable row level security;
alter table public.briefs     enable row level security;
alter table public.watchlists enable row level security;
alter table public.alerts     enable row level security;

-- Public read; writes only via service role (which bypasses RLS).
create policy "events are public" on public.events for select using (true);
create policy "briefs are public" on public.briefs for select using (true);

create policy "own watchlists" on public.watchlists for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "read own alerts" on public.alerts for select
  using ((select auth.uid()) = user_id);
create policy "mark own alerts read" on public.alerts for update
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Live updates to the map/feed
alter publication supabase_realtime add table public.events;
