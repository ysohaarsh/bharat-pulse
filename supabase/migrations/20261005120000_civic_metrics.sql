-- Citizen reports (potholes & co.), panel metrics, and the translation cache.

-- ---------- Civic reports ----------
create table public.reports (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  kind         text not null check (kind in
                 ('pothole','garbage','streetlight','waterlogging','water_supply','construction_hazard','encroachment','other')),
  description  text not null check (char_length(description) between 3 and 1000),
  -- India's bounding box: keeps the layer on-topic and cheap to index.
  lat          double precision not null check (lat between 6 and 37.5),
  lng          double precision not null check (lng between 68 and 97.5),
  -- Storage path inside the report-photos bucket; must live in the reporter's own folder.
  photo_path   text check (photo_path is null or photo_path like (user_id::text || '/%')),
  status       text not null default 'open' check (status in ('open','resolved')),
  upvotes      integer not null default 0,
  -- Filled by trigger from the boundary polygons.
  state        text,
  district     text,
  pc_code      text,
  ac_code      text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index reports_created_idx on public.reports (created_at desc);
create index reports_state_idx   on public.reports (state, created_at desc);
create index reports_user_idx    on public.reports (user_id, created_at desc);

create table public.report_votes (
  report_id  bigint not null references public.reports on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

alter table public.reports      enable row level security;
alter table public.report_votes enable row level security;

create policy "reports are public" on public.reports for select using (true);
create policy "report as yourself" on public.reports for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'open' and upvotes = 0);
create policy "update own reports" on public.reports for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own reports" on public.reports for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Reporters may only change the status of their own reports.
revoke update on public.reports from anon, authenticated;
grant update (status) on public.reports to authenticated;
-- Location columns are trigger-owned.
revoke insert on public.reports from anon, authenticated;
grant insert (kind, description, lat, lng, photo_path) on public.reports to authenticated;

create policy "votes are public" on public.report_votes for select using (true);
create policy "vote as yourself" on public.report_votes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "unvote own" on public.report_votes for delete to authenticated
  using ((select auth.uid()) = user_id);
revoke update on public.report_votes from anon, authenticated;

-- Location, resolved_at and a per-user daily cap. Must be SECURITY DEFINER: the reporter has no
-- INSERT privilege on the location columns this trigger writes.
create or replace function public.reports_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  loc record;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.reports r
        where r.user_id = new.user_id and r.created_at > now() - interval '1 day') >= 10 then
      raise exception 'daily report limit reached (10)' using errcode = 'check_violation';
    end if;
    select * into loc from public.locate(new.lat, new.lng);
    new.state    := loc.state_code;
    new.district := loc.district;
    new.pc_code  := loc.pc_code;
    new.ac_code  := loc.ac_code;
  end if;
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status <> 'resolved') then
    new.resolved_at := now();
  elsif new.status = 'open' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.reports_before_write() from public, anon, authenticated;
create trigger reports_before_write
  before insert or update on public.reports
  for each row execute function public.reports_before_write();

create or replace function public.report_votes_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reports
     set upvotes = (select count(*) from public.report_votes v
                    where v.report_id = coalesce(new.report_id, old.report_id))
   where id = coalesce(new.report_id, old.report_id);
  return null;
end;
$$;
revoke execute on function public.report_votes_count() from public, anon, authenticated;
create trigger report_votes_count
  after insert or delete on public.report_votes
  for each row execute function public.report_votes_count();

alter publication supabase_realtime add table public.reports;

-- Photo bucket: public read, 5 MB images, uploads only into "<your user id>/...".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "upload own report photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'report-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own report photos" on storage.objects for delete to authenticated
  using (bucket_id = 'report-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- Panel metrics ----------
-- Latest value per (key, region): power demand, AQI per station, mandi modal prices.
create table public.metrics (
  key          text not null,               -- 'power.demand', 'aqi.station', 'mandi.modal:Onion'
  region       text not null,               -- 'IN', a state code, or a station/market id
  label        text not null,
  value        double precision not null,
  unit         text not null,
  lat          double precision,
  lng          double precision,
  state        text,
  observed_at  timestamptz not null,
  meta         jsonb not null default '{}',
  updated_at   timestamptz not null default now(),
  primary key (key, region)
);
create index metrics_key_value_idx on public.metrics (key, value desc);

-- Time series for sparklines (national figures only, pruned after 30 days).
create table public.metric_history (
  key          text not null,
  region       text not null,
  value        double precision not null,
  observed_at  timestamptz not null,
  primary key (key, region, observed_at)
);

alter table public.metrics        enable row level security;
alter table public.metric_history enable row level security;
create policy "metrics are public"        on public.metrics        for select using (true);
create policy "metric history is public"  on public.metric_history for select using (true);
revoke insert, update, delete on public.metrics, public.metric_history from anon, authenticated;

-- ---------- Translation cache (service role only: no policies) ----------
create table public.translations (
  hash        text not null,                 -- sha256 of source lang + text
  lang        text not null,                 -- target language
  text        text not null,
  provider    text not null,
  created_at  timestamptz not null default now(),
  primary key (hash, lang)
);
alter table public.translations enable row level security;

-- ---------- Development projects (OSM construction, refreshed by the `osm` job) ----------
-- Not events: a metro line under construction is a standing fact, not a 24-hour headline.
create table public.projects (
  id           bigint generated always as identity primary key,
  source       text not null,                -- 'osm'
  external_id  text not null,
  kind         text not null,                -- 'metro', 'railway', 'highway', 'building', 'other'
  name         text not null,
  lat          double precision not null,
  lng          double precision not null,
  state        text,
  segments     integer not null default 1,
  url          text,
  meta         jsonb not null default '{}',
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  unique (source, external_id)
);
create index projects_state_idx on public.projects (state, kind);
alter table public.projects enable row level security;
create policy "projects are public" on public.projects for select using (true);
revoke insert, update, delete on public.projects from anon, authenticated;
