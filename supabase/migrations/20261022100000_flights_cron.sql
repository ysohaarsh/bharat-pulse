-- Every 30 min: aircraft over India from OpenSky (lib/jobs/flights.ts).
-- Anonymous quota is 400 credits/day per IP; the India box costs 4 per call -> 48 calls = 192 credits/day.
-- Writes flights.total/airborne/ground/india_registered (+ history) and the latest positions snapshot
-- (metrics key 'flights.positions', meta.aircraft rows in meta.fields order); public-read via the metrics policy.
select cron.schedule('bharat-flights', '12,42 * * * *', $$ select public.bharat_call('/api/ingest?source=flights') $$);
