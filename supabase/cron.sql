-- In Supabase Vault create cliffhanger_project_url (https://<ref>.supabase.co)
-- and cliffhanger_cron_secret (the same value as the Edge Function CRON_SECRET).
-- Do not commit the secret. Configure JWT verification as described in README.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'cliffhanger-airing-notifications';
select cron.schedule(
  'cliffhanger-airing-notifications', '0 * * * *',
  $$select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cliffhanger_project_url') || '/functions/v1/airing-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cliffhanger_cron_secret')),
    body := '{}'::jsonb
  );$$
);
