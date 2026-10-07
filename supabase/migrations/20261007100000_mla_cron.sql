-- Weekly: sitting MLAs (Vidhan Sabha) from Wikipedia assembly pages (lib/jobs/mla.ts).
-- Rows go into public.representatives with house = 'vs'; whois() already returns them via
-- boundary_code = 'AC:<state>:<seat no.>'.
select cron.schedule('bharat-mla', '15 3 * * 1', $$ select public.bharat_call('/api/ingest?source=mla') $$);
