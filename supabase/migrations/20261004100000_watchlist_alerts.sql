-- Watchlist alerts: every new event is matched against all watchlists and an
-- alert row is created for each match. Mirrors lib/watchlists/match.ts
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
    and (pg_catalog.cardinality(w.countries) = 0 or new.country = any (w.countries))
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

comment on function public.create_watchlist_alerts() is
  'AFTER INSERT trigger on public.events: inserts public.alerts rows for matching watchlists. Mirror: lib/watchlists/match.ts';

-- Trigger functions are never called directly; keep it out of the API surface.
revoke execute on function public.create_watchlist_alerts() from public, anon, authenticated;

create trigger events_create_watchlist_alerts
  after insert on public.events
  for each row
  execute function public.create_watchlist_alerts();

-- Fast unread counts for the nav badge.
create index if not exists alerts_user_unread_idx
  on public.alerts (user_id)
  where read_at is null;

-- FK lookup for alerts -> events joins / cascades.
create index if not exists alerts_event_idx on public.alerts (event_id);

-- Live alert badge updates (RLS "read own alerts" still applies to Realtime).
alter publication supabase_realtime add table public.alerts;
