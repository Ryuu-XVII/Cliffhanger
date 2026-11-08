# Cliffhanger

A native-first anime and manga tracker built with React Native, Expo SDK 57,
TypeScript, Expo Router, Zustand, and Supabase. Episode logging updates locally
before any network request. AniList provides the primary catalog, AnimeSchedule
provides additional airing information, and Jikan provides MAL information.

## Features

- Search, discovery, seasonal browsing, and title details
- Anime episode and manga chapter progress, completion, rewatching, and undo
- Scores, notes, custom lists, library filters, and statistics
- Local guest libraries; email, Google, and Apple account flows
- Supabase account sync and linked AniList import/write-back
- JSON export and MAL XML import/export
- Opt-in airing notifications, quiet hours, reduced motion, and haptics

## Run locally

Use Node.js 24 (Expo SDK 57 requires at least Node.js 22.13).

```sh
npm ci
cp .env.example .env
npm start
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for accounts and cloud sync. Without
these, a guest library works locally. Never put the Supabase service-role key
or OAuth client secrets in `EXPO_PUBLIC_*` variables.

MMKV is used in native builds. When MMKV is unavailable, the app uses durable
Expo FileSystem storage on native platforms or localStorage on the web. User
data and queued writes never intentionally fall back to an in-memory store.
Storage failures are reported instead of pretending a save succeeded.

Expo Go can exercise local functionality, but native development/release builds
are required to test Android remote push notifications. See [RELEASE.md](RELEASE.md)
for Android configuration, signing, and FCM setup.

## Supabase setup and upgrade

1. For a new database, run `supabase/schema.sql` as the baseline.
2. Apply every file in `supabase/migrations/` in filename order. Existing
   installations apply only migrations they have not applied yet.
3. Enable the desired auth providers and add `cliffhanger://auth-callback` to
   the allowed redirect URLs. Configure provider credentials in Supabase.
4. Configure an AniList OAuth application separately; put its public client ID
   in `EXPO_PUBLIC_ANILIST_CLIENT_ID` and register `cliffhanger://anilist-auth`.

**The reliability update requires `202611080001_library_sync.sql` before the
updated app is released.** It introduces version-checked writes, deletion
records, and notification delivery ownership. The new client intentionally
fails cloud writes if the migration is missing; it does not bypass conflict
protection. Old clients that write directly to entries/lists must be upgraded,
since those direct write policies are replaced by read-only policies.

Supabase handles authentication, database storage, and the notification worker.
Firebase is used only for Android FCM configuration; there is no Firestore or
Firebase Cloud Functions backend in this repository.

## How sync works

- UI changes are stored locally and queued by account. Repeated edits coalesce
  by entry/list; each operation has a revision so acknowledging an upload
  cannot remove a newer edit.
- `apply_library_change` derives ownership from the JWT and compares versions
  under the database row lock. Older writes and deletes cannot replace newer
  versions. Deleted entries/lists retain tombstones so old devices cannot
  resurrect them with an older version.
- After uploads, a full remote snapshot reconciles acknowledged entries and
  lists, including renames and deletions. Pending local edits and deletions
  remain protected. New guest-account migrations enqueue their copied data.
- Runs check the initiating account session after network waits. Account
  changes clear the in-memory AniList identity as well as stored credentials.
- Versions use client timestamps, so device clocks should be accurate. This
  implements last-write-wins, not a merge of simultaneous episode increments.
- AniList write-back is best effort; rejected AniList writes do not roll back
  a successful Supabase save. The Data screen offers an explicit AniList sync.

## Airing notifications

Set `EXPO_PUBLIC_AIRING_DELIVERY_MODE` to exactly one transport:

| Mode | Behavior |
| --- | --- |
| `local` (default) | Schedules upcoming episodes on the device. Works for guests and offline after scheduling. The server excludes these devices. |
| `push` | Cancels local schedules and uses the Supabase worker. Requires an authenticated account, registered device token, deployed worker, and working Expo/FCM credentials. |

There is no automatic fallback between transports, which would risk sending
both a local alert and a push for the same episode. Rebuild/restart after changing
an `EXPO_PUBLIC_*` setting and reopen the app to refresh device registration.
Local schedules are serialized and rebuilt when title language, quiet hours,
account, or watched titles change.

For server pushes:

1. Deploy `supabase/functions/airing-notifications` with JWT verification
   disabled (`supabase functions deploy airing-notifications --no-verify-jwt`).
   The handler independently requires its private `CRON_SECRET` bearer token.
2. Set the function's `CRON_SECRET` using Supabase secret management.
3. In Supabase Vault, create `cliffhanger_project_url` with the project URL and
   `cliffhanger_cron_secret` with the same secret. Do not commit the secret.
4. Run `supabase/cron.sql` to install the hourly worker schedule.
5. Enable notifications in the app. Confirm FCM V1 credentials are uploaded
   to EAS before testing Android delivery.

The worker announces episodes from the preceding 65 minutes, never future
episodes. It claims receipts before sending to avoid duplicates. Explicit
rejections release claims for retry; ambiguous network outcomes retain them,
which can miss an alert rather than send it twice. Delays beyond the lookback
window can also miss alerts. Expo push tickets indicate acceptance, not final
OS delivery.

## Checks

```sh
npm run check
npx expo export --platform android --output-dir /tmp/cliffhanger-export
```

`check` runs strict TypeScript, Jest, PostgreSQL migration/security tests in
PGlite, and the notification worker with controlled external services. GitHub
Actions runs the same checks plus an Android JavaScript bundle export on PRs
and pushes to `master`. Exporting verifies bundling; device behavior and native
signing still need the release checks described in `RELEASE.md`.

```sh
npm run check:live
```

The optional live smoke test requires Supabase credentials. Use a dedicated
test account through `LIVE_CHECK_EMAIL` / `LIVE_CHECK_PASSWORD`, or a disposable
account where email-confirmation settings permit automated sign-up. It performs
real writes and account deletion only for the disposable account it creates.
Do not use a personal library as a test fixture.
