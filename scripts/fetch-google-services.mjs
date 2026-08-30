#!/usr/bin/env node
/**
 * Restores `google-services.json`, which is gitignored because it carries a
 * Firebase project API key.
 *
 * The file is required for FCM registration on Android: without it,
 * `getExpoPushTokenAsync` fails and the device never receives a push token, so
 * airing notifications silently never arrive. See app.json -> android.googleServicesFile.
 *
 * Requires an authenticated Firebase CLI (`firebase login`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'google-services.json');

const PROJECT = 'cliffhanger-anime-tracker';
const ANDROID_APP_ID = '1:105149376492:android:65f7a868388ad90e0e82c9';

if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.log('google-services.json already present. Pass --force to overwrite.');
  process.exit(0);
}

try {
  execFileSync(
    process.platform === 'win32' ? 'firebase.cmd' : 'firebase',
    ['apps:sdkconfig', 'ANDROID', ANDROID_APP_ID, '--project', PROJECT, '--out', OUT],
    { stdio: 'inherit' },
  );
  console.log('\nWrote ' + OUT);
} catch {
  console.error(
    '\nCould not fetch the config. Check that the Firebase CLI is installed and that\n' +
      '`firebase login` has been run for the account owning ' + PROJECT + '.',
  );
  process.exit(1);
}
