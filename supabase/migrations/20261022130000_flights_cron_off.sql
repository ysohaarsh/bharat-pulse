-- Flights moved to the GitHub "Flights relay" workflow (.github/workflows/flights-relay.yml):
-- OpenSky refuses connections from Vercel/AWS, so the pg_cron → Vercel fetch always failed.
select cron.unschedule('bharat-flights');
