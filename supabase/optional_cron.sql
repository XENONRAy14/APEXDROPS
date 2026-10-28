-- Optional: run as the database administrator after enabling pg_cron in Supabase.
-- Expiry is also processed on every game_state / game_action request.
-- This job refunds unattended expired lobbies even when nobody is online.
SELECT cron.schedule('apex-expire-duels', '* * * * *', 'SELECT public.expire_duels()');
-- Cancel with: SELECT cron.unschedule('apex-expire-duels');
