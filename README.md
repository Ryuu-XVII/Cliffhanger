# Cliffhanger

An anime tracker built to the spec in `../cliffhanger-spec.md`, with the visual
system from `../UI EXAMPLES/DESIGN.md` ("Obsidian Kinetic").

The differentiator is not the data. It is how fast you can log an episode and
how the app feels while you do it.

---

## Resolved decisions (§2)

| # | Decision | Resolved as |
|---|---|---|
| D-1 | Platform | Native mobile first |
| D-2 | Framework | React Native + Expo (SDK 57), TypeScript strict |
| D-3 | Accounts | All three: anonymous, app account, AniList linked |
| D-4 | Data source | AniList primary · AnimeSchedule for airing · Jikan for MAL scores |
| D-5 | Name | Cliffhanger (working title — trademark check still outstanding) |
| D-6 | Monetisation | Free, no ads |
| D-7 | 3D scope | Dimensional UI motion only |

---

## Running it

```bash
npm install
npx expo start
```

The Firebase project is **live and wired up**: `cliffhanger-anime-tracker`
([console](https://console.firebase.google.com/project/cliffhanger-anime-tracker/overview)).
`.env` already holds its config, `firebase/` holds the native
`google-services.json` and `GoogleService-Info.plist`, and Firestore is
created in `europe-west1` with the rules and indexes from this repo deployed.

Two native modules are not available in Expo Go - MMKV (a Nitro module) and
push notifications. Both degrade gracefully, but for the real thing build a
development client:

```bash
npx eas build --profile development --platform android
```

Authentication is live: email/password and anonymous sign-in are both enabled,
so all three account paths in §5 work against the real project.

```bash
npm run check:live    # signs in, exercises the rules, cleans up after itself
```

### What is still gated on you

1. **Upgrade to Blaze if you want the notification backend.** `firebase deploy
   --only functions` fails on Spark because Artifact Registry cannot be
   enabled. F-13 still works in the meantime: the device-side scheduler in
   `src/features/notifications/notifications.ts` covers the next seven days of
   airings on its own. The account listed under this login is currently closed,
   so this is a billing decision, not a deploy problem.

### Builds

The project is linked to EAS (`ryuuxviis-team/cliffhanger`) and the Android
credentials live on the Expo server.

```bash
npx eas build --platform android --profile preview      # APK, sideloadable
npx eas build --platform android --profile production   # AAB, for the Play Store
```

**`.env` is gitignored, so EAS Build never receives it.** The
`EXPO_PUBLIC_FIREBASE_*` values are stored as EAS environment variables in the
production, preview and development environments instead. Change one in
`.env` and you must push it again, or the build silently ships without a
Firebase config and the app falls back to local-only:

```bash
grep -E "^EXPO_PUBLIC_[A-Z_]+=.+$" .env > .env.eas.tmp
npx eas env:push --environment production --environment preview   --environment development --path .env.eas.tmp --force
rm .env.eas.tmp
```

(The filter matters: `env:push` rejects empty values, and `.env` carries
empty placeholders for the Google and AniList client ids.)

### Backend

```bash
cd functions && npm install && npm run build
firebase deploy --only firestore:rules,firestore:indexes   # done, re-runnable
firebase deploy --only functions                            # needs Blaze
```

---

## Verified

- `npm run typecheck` — clean, strict mode, no `any` without a reason.
- `npm test` — 79 tests, 13 suites, all passing. Covers the API layer
  (timeouts, retries, 429 handling, cache tiers, rate limiting), the data
  transforms, the offline write queue, import/export round-trips, and the
  §12 critical path: add → increment → complete → undo.
- `npx expo export --platform android` — bundles clean (6.5MB Hermes bundle).
- `cd functions && npm run build` — compiles clean.
- `npm run check:live` — **12/12 against the real project.** Anonymous
  sign-in; own-data read and write; the rules rejecting a mismatched document
  id, an out-of-range score, an unknown status, negative progress, another
  user's library, and a client write to `animeCache`; and the §5
  anonymous → account upgrade preserving both the uid and the library. It
  deletes its throwaway user and documents afterwards.
- The exported bundle really does carry the Firebase config — worth
  re-checking after any `.env` change, because Metro will happily serve a
  cached bundle built without it (`--clear` forces the reload).

**Not verified:** nothing has run on a physical device from here. The §16
device checklist (Galaxy S25 Ultra, a mid-range Android, cold start under 2s,
screen-reader pass) is still yours to run.

---

## Where things live

Feature-based, per §3.3 — not `/components`, `/hooks`, `/screens`.

```
app/                        Expo Router routes only; no logic
  (tabs)/                   Home, Library, Discover, Profile
  title/[id].tsx            Detail (F-02)
  entry/[id].tsx            Edit entry modal
  settings/                 index, notifications, data, account
src/
  api/                      The ONLY place a network call happens (§3.3)
    http.ts                 Timeout, backoff, 429, offline short-circuit
    rateLimiter.ts          Token bucket: 30/min AniList, 1/sec MAL
    cache.ts                §4.5.2 tiers, stale-on-failure degradation
    anilist/                Client, queries, types, service functions
    animeschedule/          Airing times, delays, streaming links
    jikan/                  MAL scores; never breaks a screen when it fails
    hooks.ts                TanStack Query hooks — the React-facing surface
  data/                     Models, transforms, Firestore, sync, auth
  stores/                   Zustand: library, settings, auth, toasts
  features/                 One folder per feature area
  ui/                       The design system (Obsidian Kinetic)
  theme/                    Tokens straight from DESIGN.md
functions/                  §11 notification pipeline + shared metadata cache
```

## Data sources

| Service | Role | Auth | Notes |
|---|---|---|---|
| **AniList** | Catalogue, search, metadata, relations, recommendations | None for reads | Canonical id for everything (§4.6) |
| **AnimeSchedule.net** | Airing times, **delays and breaks**, streaming links | None (public endpoints) | Looked up by `?anilist-ids=`, never by title |
| **Jikan** | MAL community score and rank | None | Read-only MAL mirror, fallback only |

Filler-tracking APIs were deliberately skipped — none are reliable enough yet.

**Why AnimeSchedule earns its place:** AniList's `nextAiringEpisode` keeps
counting down to a slot even when nothing will air in it. Checked live while
building this, AniList said Re:Zero season 4 had episode 15 inbound;
AnimeSchedule reported `"Break"`, and One Piece `"Delayed"`. The detail
screen now demotes the countdown and leads with the delay.

Three traps that layer handles, all observed in real responses:
- A null datetime is the sentinel `0001-01-01T00:00:00Z`, not `null` — parsing
  it naively puts unaired shows in the year 1.
- `delayedTimetable` is sometimes absent entirely rather than an empty string.
- `episodes` can be `undefined` on long-runners like One Piece.

`/timetables` needs an OAuth token and returns 401 without one. A token in the
client bundle would break §3.3, so only the public endpoints are used; if the
full weekly timetable is ever wanted it belongs behind a Cloud Function, per
§4.5.1.

## Feature coverage

**Phase 1** — F-01 search (300ms debounce, filters, recents) · F-02 detail
(synopsis, tags, studio, relations, characters, MAL score) · F-03 six list
states · F-04 progress with auto-complete and undo · F-05 one-tap logging from
Home, library cards and rows · F-06 scoring in 10/100/5-star · F-07 library
with filter, sort, grid and list · F-08 seasonal browse with a correct season
stepper · F-09 discover shelves · F-10 offline library with a queued,
coalescing write log · F-11 title language applied everywhere including
notifications · F-12 three-screen skippable onboarding that never asks for an
account.

**Phase 2** — F-13 airing notifications (device scheduler that arms itself on
launch, on resume and whenever the watched set changes, plus the Cloud
Functions pipeline for push) · F-14 countdowns · F-16 notes · F-17 rewatch tracking · F-18 custom
lists · F-19 stats with charts · F-20 import from AniList and MAL XML ·
F-21 export as JSON and MAL XML · F-22 streaming availability merged from
AniList and AnimeSchedule, filtered to official licensors only.

Also carried in from Phase 3 where it cost nothing: F-26 recommendations
(AniList's own edges), F-28 OLED mode and accent themes, F-29 characters and
voice actors, and the data model shape for F-25 manga.

---

## Deviations from the spec — flagged, not silent (§0.5)

1. **React Native Skia is not installed.** §3.1 lists it for "shader effects,
   blur, custom card treatments". Blur is `expo-blur`, the card treatments are
   Reanimated transforms, and the stats charts are plain `react-native-svg`.
   Nothing left needed a Skia canvas, and an unused native module works against
   the sub-2-second cold start in §12. Add it back the moment a real shader
   surface exists.

2. **The shared-element transition is hand-built.** §9 asks for a shared-element
   transition from the library card cover to the detail hero. Reanimated 4 (the
   version Expo SDK 57 ships) removed `sharedTransitionTag`, and it has no
   replacement on the new architecture. `src/features/title/hero.tsx` measures
   the card's cover rect in window space before navigating and springs a hero
   overlay from that rect to the destination. Same read, no dead API.

3. **F-15 home screen widgets are not built.** WidgetKit and Android App Widgets
   need native target code, an Xcode/Android Studio build, and a device to
   verify on — none of which can be done or checked from here. Everything the
   widget would read (currently-watching entries, progress, the increment
   action) is already in the store layer behind a stable interface.

4. **F-23/F-24 two-way sync is Phase 3 and was not built.** The AniList write
   mutations exist (`saveMediaListEntry`, `deleteMediaListEntry`) and the
   conflict strategy is implemented in `src/data/sync.ts` — last-write-wins with
   a visible warning — but the app does not yet push to AniList on every change.

5. **`animeCache` (§8) is served by a callable Cloud Function, not read
   directly by clients.** The rules make it client-read-only as specified; the
   function is what keeps a cache miss from turning into an unthrottled client
   request.

6. **Days-watched in stats is an estimate.** AniList does not publish a runtime
   for every entry, so it assumes 24 minutes an episode and 105 for a film. The
   screen says so rather than presenting it as fact.

---

## Things the spec asked for that are easy to break later

- **Never key anything off a title string** (§4.6). `anilistId` is the document
  id, the cache key and the notification idempotency key. The MAL XML importer
  resolves every row to an AniList id before writing and reports what it could
  not resolve rather than guessing.
- **Every animation needs a reduced-motion path** (§9). `useReducedMotion()`
  reads both the OS setting and the in-app override; every animated component
  branches on it. New motion must too.
- **The +1 is never on the network's critical path** (F-05). Increment writes to
  the store synchronously, persists locally, and queues a sync. Anything that
  makes it `await` has broken the app's whole premise.
- **Notification titles use the user's title language** (§4.6). Both the device
  scheduler and the Cloud Function call the same resolver. A named competitor
  ships this bug; do not inherit it.
- **Export must keep working** (F-21). Users must be able to leave with their
  data. It is tested; keep it that way.
