# Releasing Cliffhanger

Everything needed to cut a production Android build, and the few things that
still need a human.

## One-time setup on a new machine

These files are gitignored because they carry credentials. Without them the
build still runs, but it will be debug-signed and push will not work.

| File | How to restore | What breaks without it |
|---|---|---|
| `.env` | Copy `.env.example` and fill in | Supabase auth and sync |
| `google-services.json` | `npm run fetch:google-services` | FCM registration, so no push notifications |
| `credentials/cliffhanger-upload.jks` | **Restore from your backup** | Release builds fall back to debug signing |
| `credentials/keystore.properties` | **Restore from your backup** | Same |
| `android/local.properties` | `sdk.dir=<path to Android SDK>` | Gradle cannot find the SDK |

> **The upload keystore cannot be regenerated.** Google Play ties a listing to
> its signing key. Lose `cliffhanger-upload.jks` and you can never publish an
> update to the same listing again — you would have to ship a new app under a
> new package name and lose every install and review. Back up the whole
> `credentials/` folder somewhere off this machine before publishing.

## Cutting a release

1. Bump `expo.version` and `expo.android.versionCode` in `app.json`.
   `versionCode` must increase on every upload; Play rejects a repeat.
2. Verify: `npm run typecheck && npm test`
3. `npx expo prebuild --platform android --no-install --clean`
   Regenerates `android/`. The `withReleaseSigning` plugin reapplies the release
   signing config, which is why editing `android/app/build.gradle` by hand never
   sticks. `local.properties` is wiped by `--clean` and must be rewritten.
4. `cd android && ./gradlew assembleRelease bundleRelease`
5. Confirm the signer is the upload key, not the debug key:
   ```
   apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
   ```
   It must print `CN=Cliffhanger`. If it prints `CN=Android Debug`, the keystore
   is missing and the upload will be rejected.

Outputs:
- `android/app/build/outputs/bundle/release/app-release.aab` — **upload this to Play**
- `android/app/build/outputs/apk/release/app-release.apk` — sideload/testing only

Play Store requires the `.aab`. The `.apk` is for installing directly on a device.

## Build environment notes

Gradle and an Android emulator together will exhaust memory on a 16GB machine —
this has crashed the host outright. Stop the emulator before building:

```
adb emu kill
```

A build alone wants roughly 8GB free. If Gradle dies with a Metaspace error,
that is memory pressure, not a code problem: free memory and rerun.

## Backend

The app talks to Supabase project `sturyqkojzjlxmnxmvud` (`Cliffhanger`, eu-west-1).

- Schema lives in `supabase/schema.sql`; incremental changes in `supabase/migrations/`.
- Edge function `airing-notifications` runs on a cron (`supabase/cron.sql`) and
  needs `CRON_SECRET` set in the function's environment.
- Redeploy the function after editing it — editing the file alone changes nothing.

## Still needs a human

- **FCM key upload.** Push delivery needs the FCM V1 service account uploaded to
  EAS: `eas credentials --platform android` → *Push Notifications: Manage FCM V1*
  → upload `fcm-service-account.json`. This step is interactive. Until it is
  done, devices register tokens but Expo cannot deliver to them.
- **Play Console listing**: store entry, screenshots, content rating
  questionnaire, and the data-safety form. The data-safety answers must match
  `app/settings/privacy.tsx` — that screen is the source of truth for what the
  app collects.
- **Privacy policy URL.** Play requires a publicly reachable URL. The in-app
  screen covers the app requirement but Play also wants it hosted.
- **Trademark check on the name** (spec D-5) before the listing goes live.
