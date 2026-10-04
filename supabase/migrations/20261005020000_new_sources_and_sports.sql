-- New sources (GDACS disaster alerts, WHO outbreak news, sports RSS) and a `sports` category.
-- Keep in sync with SOURCES / CATEGORIES in lib/types.ts.

alter table public.events drop constraint events_source_check;
alter table public.events add constraint events_source_check
  check (source in ('usgs','eonet','gdelt','rss','gdacs','who','sports'));

alter table public.events drop constraint events_category_check;
alter table public.events add constraint events_category_check
  check (category in ('earthquake','wildfire','storm','volcano','flood','conflict','politics','economy','health','sports','other'));

alter table public.watchlists drop constraint watchlists_categories;
alter table public.watchlists add constraint watchlists_categories check (
  categories <@ array['earthquake','wildfire','storm','volcano','flood','conflict','politics','economy','health','sports','other']::text[]
);
