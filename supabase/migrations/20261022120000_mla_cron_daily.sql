-- MLAs: 31 assemblies don't fit one 60 s run (Wikipedia throttles bursts), so the job now does the
-- stalest states first within its budget. Run daily so every state is refreshed within a few days.
-- Re-scheduling an existing job name replaces it.
select cron.schedule('bharat-mla', '15 3 * * *', $$ select public.bharat_call('/api/ingest?source=mla') $$);
