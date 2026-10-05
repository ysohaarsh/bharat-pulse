-- Scheduled jobs: pg_cron calls the deployed app over HTTP (pg_net).
--
-- Requires two Vault secrets, created once per environment and never committed:
--   select vault.create_secret('https://<your-app>.vercel.app', 'bharat_app_url');
--   select vault.create_secret('<CRON_SECRET from Vercel>',      'bharat_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- POST <app>/<path> with the cron bearer token, both read from Vault at run time.
create or replace function public.bharat_call(path text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'bharat_app_url') || path,
    headers := pg_catalog.jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'bharat_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;
revoke execute on function public.bharat_call(text) from public, anon, authenticated;

-- Fast-moving feeds every 10 minutes (one HTTP call each so a slow source can't starve the rest).
select cron.schedule('bharat-sachet', '*/10 * * * *', $$ select public.bharat_call('/api/ingest?source=sachet') $$);
select cron.schedule('bharat-ncs',    '2-59/10 * * * *', $$ select public.bharat_call('/api/ingest?source=ncs') $$);
select cron.schedule('bharat-news',   '4-59/10 * * * *', $$ select public.bharat_call('/api/ingest?source=news') $$);
select cron.schedule('bharat-pib',    '6-59/10 * * * *', $$ select public.bharat_call('/api/ingest?source=pib') $$);
select cron.schedule('bharat-power',  '8-59/10 * * * *', $$ select public.bharat_call('/api/ingest?source=power') $$);
-- Machine-translate new headlines to English/Hindi (Bhashini → Sarvam; skipped without keys).
select cron.schedule('bharat-translate', '9-59/10 * * * *', $$ select public.bharat_call('/api/ingest?source=translate') $$);

-- Hourly: CPCB updates stations hourly; FIRMS publishes a few passes a day.
select cron.schedule('bharat-aqi',    '20 * * * *', $$ select public.bharat_call('/api/ingest?source=aqi') $$);
select cron.schedule('bharat-firms',  '35 * * * *', $$ select public.bharat_call('/api/ingest?source=firms') $$);
select cron.schedule('bharat-sports', '50 * * * *', $$ select public.bharat_call('/api/ingest?source=sports') $$);

-- Daily (IST mornings; cron runs in UTC).
select cron.schedule('bharat-mandi',  '30 6 * * *', $$ select public.bharat_call('/api/ingest?source=mandi') $$);
-- OSM construction (metro, rail, highways): 6 states per run, all 36 states every 6 hours.
select cron.schedule('bharat-osm',    '40 * * * *', $$ select public.bharat_call('/api/ingest?source=osm') $$);
select cron.schedule('bharat-brief',  '45 0 * * *', $$ select public.bharat_call('/api/brief') $$);   -- 06:15 IST

-- Weekly: sitting MPs from sansad.in (by-elections, deaths, resignations).
select cron.schedule('bharat-sansad', '0 3 * * 1', $$ select public.bharat_call('/api/ingest?source=sansad') $$);

-- Keep the free-tier database small.
select cron.schedule('bharat-prune', '30 21 * * *', $$
  delete from public.events where occurred_at < now() - interval '30 days';
  delete from public.metric_history where observed_at < now() - interval '30 days';
  delete from public.projects where last_seen < now() - interval '14 days';
$$);
