-- Abuse limits for watchlists, enforced in the database because the anon key is public:
-- a signed-in user can call PostgREST directly and bypass the Server Action's zod schema.
-- Without these, one user could create thousands of match-everything watchlists and every
-- ingested event would fan out into thousands of alert rows.

alter table public.watchlists
  add constraint watchlists_name_len   check (char_length(name) between 1 and 80),
  add constraint watchlists_countries  check (cardinality(countries) <= 50),
  add constraint watchlists_keywords   check (cardinality(keywords) <= 20),
  add constraint watchlists_categories check (
    categories <@ array['earthquake','wildfire','storm','volcano','flood','conflict','politics','economy','health','other']::text[]
  );

-- Per-element checks + per-user cap. SECURITY INVOKER: under RLS the count sees only the user's rows.
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
  if exists (select 1 from pg_catalog.unnest(new.countries) as c(code) where c.code !~ '^[A-Z]{2}$') then
    raise exception 'countries must be ISO 3166-1 alpha-2 codes' using errcode = 'check_violation';
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
