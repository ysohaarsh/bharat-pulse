-- Users may only flip read_at on their own alerts (RLS limits rows; this limits columns).
revoke update on public.alerts from anon, authenticated;
grant update (read_at) on public.alerts to authenticated;

-- Writes to events/briefs only ever happen via the service role.
revoke insert, update, delete on public.events, public.briefs from anon, authenticated;
