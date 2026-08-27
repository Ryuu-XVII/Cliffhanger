create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'cliffhanger-airing-notifications';
select cron.schedule(
  'cliffhanger-airing-notifications',
  '0 * * * *',
  $$select net.http_post(
    url := 'https://sturyqkojzjlxmnxmvud.supabase.co/functions/v1/airing-notifications',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );$$
);
