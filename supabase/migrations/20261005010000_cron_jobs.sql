-- Scheduled jobs: pg_cron calls the deployed app over HTTP (pg_net).
--
-- Requires two Vault secrets, created once per environment and never committed:
--   select vault.create_secret('https://<your-app>.vercel.app', 'pulse_app_url');
--   select vault.create_secret('<CRON_SECRET from Vercel>',      'pulse_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- POST <app>/<path> with the cron bearer token, both read from Vault at run time.
create or replace function public.pulse_call(path text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'pulse_app_url') || path,
    headers := pg_catalog.jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pulse_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;
revoke execute on function public.pulse_call(text) from public, anon, authenticated;

-- Pull all sources every 10 minutes.
select cron.schedule('pulse-ingest', '*/10 * * * *', $$ select public.pulse_call('/api/ingest') $$);

-- World Brief for the previous 24h, shortly after midnight UTC.
select cron.schedule('pulse-brief', '15 0 * * *', $$ select public.pulse_call('/api/brief') $$);

-- Keep the free-tier database small: drop events older than 30 days (alerts cascade).
select cron.schedule('pulse-prune', '30 3 * * *', $$ delete from public.events where occurred_at < now() - interval '30 days' $$);
