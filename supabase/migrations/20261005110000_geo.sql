-- Boundaries (state, district, Lok Sabha seat, assembly seat, ward), elected representatives,
-- and the "who represents this point?" lookup. Polygons are loaded by scripts/load-boundaries.mjs.

create extension if not exists postgis with schema extensions;

create table public.boundaries (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('state','district','pc','ac','ward')),
  code        text not null unique,          -- 'IN-KA', 'DT:572', 'PC:S10_25', 'AC:IN-KA:162', 'WARD:BLR:123'
  name        text not null,
  name_hi     text,
  state_code  text check (state_code ~ '^IN-[A-Z]{2}$'),
  meta        jsonb not null default '{}',
  geom        extensions.geometry(MultiPolygon, 4326) not null
);
create index boundaries_geom_idx on public.boundaries using gist (geom);
create index boundaries_kind_idx on public.boundaries (kind, state_code);

create table public.representatives (
  id            bigint generated always as identity primary key,
  house         text not null check (house in ('ls','vs','ward')),  -- Lok Sabha, Vidhan Sabha, ward
  boundary_code text references public.boundaries (code) on delete set null,
  constituency  text not null,                -- as the source names it
  state_code    text check (state_code ~ '^IN-[A-Z]{2}$'),
  name          text not null,
  party         text,
  party_short   text,
  email         text,                         -- official address only
  photo_url     text,
  profile_url   text,
  source        text not null,                -- 'sansad.in', ...
  external_id   text not null,
  refreshed_at  timestamptz not null default now(),
  unique (house, external_id)
);
create index representatives_boundary_idx on public.representatives (boundary_code);

alter table public.boundaries      enable row level security;
alter table public.representatives enable row level security;
create policy "boundaries are public"      on public.boundaries      for select using (true);
create policy "representatives are public" on public.representatives for select using (true);
revoke insert, update, delete on public.boundaries, public.representatives from anon, authenticated;

-- ---------- Bulk loader (service role only) ----------
-- rows: [{kind, code, name, name_hi?, state_code?, meta?, geometry: <GeoJSON Polygon|MultiPolygon>}]
create or replace function public.load_boundaries(rows jsonb)
returns integer
language plpgsql
set search_path = public, extensions
as $$
declare
  n integer;
begin
  insert into public.boundaries (kind, code, name, name_hi, state_code, meta, geom)
  select r->>'kind', r->>'code', r->>'name', r->>'name_hi', r->>'state_code',
         coalesce(r->'meta', '{}'::jsonb),
         st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(r->>'geometry'), 4326)), 3))
  from jsonb_array_elements(rows) as r
  on conflict (code) do update
    set kind = excluded.kind, name = excluded.name, name_hi = excluded.name_hi,
        state_code = excluded.state_code, meta = excluded.meta, geom = excluded.geom;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.load_boundaries(jsonb) from public, anon, authenticated;
grant execute on function public.load_boundaries(jsonb) to service_role;

-- ---------- Point lookups ----------
-- Every boundary containing the point, smallest kinds first, with their representatives.
create or replace function public.whois(p_lat double precision, p_lng double precision)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as g),
  hits as (
    select b.kind, b.code, b.name, b.name_hi, b.state_code, b.meta
    from public.boundaries b, pt
    where st_intersects(b.geom, pt.g)
  )
  select jsonb_build_object(
    'lat', p_lat,
    'lng', p_lng,
    'boundaries', coalesce((
      select jsonb_agg(to_jsonb(h) order by array_position(array['ward','ac','pc','district','state'], h.kind))
      from hits h), '[]'::jsonb),
    'representatives', coalesce((
      select jsonb_agg(jsonb_build_object(
        'house', r.house, 'boundary_code', r.boundary_code, 'constituency', r.constituency,
        'name', r.name, 'party', r.party, 'party_short', r.party_short, 'email', r.email,
        'photo_url', r.photo_url, 'profile_url', r.profile_url, 'source', r.source,
        'refreshed_at', r.refreshed_at))
      from public.representatives r
      where r.boundary_code in (select code from hits)), '[]'::jsonb)
  );
$$;
grant execute on function public.whois(double precision, double precision) to anon, authenticated;

-- State/district for a point; used by the event and report triggers.
create or replace function public.locate(p_lat double precision, p_lng double precision,
                                         out state_code text, out district text,
                                         out pc_code text, out ac_code text)
language sql
stable
set search_path = public, extensions
as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) as g)
  select
    (select b.code from public.boundaries b, pt where b.kind = 'state'    and st_intersects(b.geom, pt.g) limit 1),
    (select b.name from public.boundaries b, pt where b.kind = 'district' and st_intersects(b.geom, pt.g) limit 1),
    (select b.code from public.boundaries b, pt where b.kind = 'pc'       and st_intersects(b.geom, pt.g) limit 1),
    (select b.code from public.boundaries b, pt where b.kind = 'ac'       and st_intersects(b.geom, pt.g) limit 1);
$$;
grant execute on function public.locate(double precision, double precision) to anon, authenticated;

-- Fill events.state / district from coordinates when the source didn't say.
create or replace function public.events_fill_location()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  loc record;
begin
  if new.lat is not null and new.lng is not null and (new.state is null or new.district is null) then
    select * into loc from public.locate(new.lat, new.lng);
    new.state    := coalesce(new.state, loc.state_code);
    new.district := coalesce(new.district, loc.district);
  end if;
  return new;
end;
$$;
revoke execute on function public.events_fill_location() from public, anon, authenticated;
create trigger events_fill_location
  before insert or update of lat, lng on public.events
  for each row execute function public.events_fill_location();
