/**
 * Live smoke test. Run with: npm run check:live
 *
 * This hits the REAL Firebase project - it signs in, writes, and deletes its
 * own throwaway user and documents, leaving nothing behind. Run it after any
 * change to firestore.rules or to the auth flows in src/data/auth.ts.
 *
 * End-to-end check against the live Firebase project, using the same JS SDK
 * the app uses. Covers the §5 account paths and the Firestore rules in §8.
 */
import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAuth,
  linkWithCredential,
  signInAnonymously,
  signOut,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';

const config = {
  apiKey: 'AIzaSyBkK08geUEX55dfLn7RnUK1KgaryVtP-uE',
  authDomain: 'cliffhanger-anime-tracker.firebaseapp.com',
  projectId: 'cliffhanger-anime-tracker',
  storageBucket: 'cliffhanger-anime-tracker.firebasestorage.app',
  messagingSenderId: '105149376492',
  appId: '1:105149376492:web:01b5599dacb87d680e82c9',
};

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

const results = [];
function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log((passed ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  -- ' + detail : ''));
}

async function expectDenied(name, run) {
  try {
    await run();
    record(name, false, 'the write was allowed');
  } catch (error) {
    const denied = String(error?.code ?? error).includes('permission-denied');
    record(name, denied, denied ? '' : String(error?.code ?? error));
  }
}

const entry = (anilistId, overrides = {}) => ({
  anilistId,
  malId: null,
  mediaType: 'ANIME',
  status: 'WATCHING',
  progress: 3,
  score: 85,
  rewatches: 0,
  notes: '',
  startedAt: null,
  completedAt: null,
  updatedAt: Date.now(),
  customListIds: [],
  notify: null,
  private: false,
  snapshot: {
    title: { romaji: 'Live check', english: null, native: null },
    coverImage: null,
    bannerImage: null,
    totalEpisodes: 12,
    format: 'TV',
    airingStatus: 'RELEASING',
    genres: ['Action'],
    averageScore: 80,
  },
  ...overrides,
});

let createdUser = null;

try {
  // 1. Anonymous sign-in - the default path in §5.
  const anon = await signInAnonymously(auth);
  const anonUid = anon.user.uid;
  record('anonymous sign-in works', Boolean(anonUid) && anon.user.isAnonymous, 'uid ' + anonUid);
  createdUser = anon.user;

  // 2. Own-data write, keyed by anilistId as the document id (§8).
  await setDoc(doc(db, 'users', anonUid, 'entries', '21'), entry(21));
  const readBack = await getDoc(doc(db, 'users', anonUid, 'entries', '21'));
  record('can write and read own entry', readBack.exists() && readBack.data().progress === 3);

  // 3. The rules must reject a document whose id is not the anilistId.
  await expectDenied('rejects a mismatched document id', () =>
    setDoc(doc(db, 'users', anonUid, 'entries', 'not-the-id'), entry(21)),
  );

  // 4. Score is stored 0-100; anything outside is rejected.
  await expectDenied('rejects an out-of-range score', () =>
    setDoc(doc(db, 'users', anonUid, 'entries', '22'), entry(22, { score: 150 })),
  );

  // 5. Unknown status values are rejected.
  await expectDenied('rejects an unknown status', () =>
    setDoc(doc(db, 'users', anonUid, 'entries', '23'), entry(23, { status: 'BINGEING' })),
  );

  // 6. Negative progress is rejected.
  await expectDenied('rejects negative progress', () =>
    setDoc(doc(db, 'users', anonUid, 'entries', '24'), entry(24, { progress: -1 })),
  );

  // 7. No reaching into another user's library.
  await expectDenied("rejects a write to another user's library", () =>
    setDoc(doc(db, 'users', 'someone-else', 'entries', '21'), entry(21)),
  );

  // 8. The shared metadata cache is read-only to clients (§8).
  await expectDenied('rejects a client write to animeCache', () =>
    setDoc(doc(db, 'animeCache', '21'), { data: {}, fetchedAt: Date.now() }),
  );

  // 9. §5: anonymous to named account must preserve all existing data.
  const email = 'livecheck-' + Date.now() + '@cliffhanger.test';
  const credential = EmailAuthProvider.credential(email, 'correct-horse-battery');
  const linked = await linkWithCredential(auth.currentUser, credential);
  createdUser = linked.user;

  record('upgrade keeps the same uid', linked.user.uid === anonUid, anonUid + ' -> ' + linked.user.uid);
  record('upgrade clears anonymous flag', linked.user.isAnonymous === false);

  const afterUpgrade = await getDoc(doc(db, 'users', anonUid, 'entries', '21'));
  record(
    'library survives the upgrade',
    afterUpgrade.exists() && afterUpgrade.data().progress === 3,
  );

  // 10. Account deletion must actually remove the data (§5, §12).
  await deleteDoc(doc(db, 'users', anonUid, 'entries', '21'));
  const afterDelete = await getDoc(doc(db, 'users', anonUid, 'entries', '21'));
  record('entry deletion works', afterDelete.exists() === false);
} catch (error) {
  record('unexpected failure', false, String(error?.code ?? error?.message ?? error));
} finally {
  // Leave no test user behind on the real project.
  try {
    if (auth.currentUser) {
      await deleteUser(auth.currentUser);
      console.log('\ncleanup: test user deleted');
    }
  } catch (error) {
    console.log('\ncleanup: could not delete test user -- ' + String(error?.code ?? error));
  }
  try {
    await signOut(auth);
  } catch {
    /* already gone */
  }
}

const failed = results.filter((r) => !r.passed);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
process.exit(failed.length === 0 ? 0 : 1);
