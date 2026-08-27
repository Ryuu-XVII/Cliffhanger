import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { firestore, requireFirestore } from './firebase';
import type { CustomList, LibraryEntry, UserProfile, UserSettings } from './models';

/**
 * Firestore mirror of §8. Nothing in the UI imports this directly - the sync
 * engine does. Document ids are the anilistId, which is what makes every write
 * idempotent and re-import duplicate-free (§8 rules).
 */

const usersCol = 'users';
const entriesCol = 'entries';
const listsCol = 'customLists';
const devicesCol = 'devices';

export function remoteAvailable(): boolean {
  return firestore() !== null;
}

export async function pushEntry(uid: string, entry: LibraryEntry): Promise<void> {
  const db = requireFirestore();
  await setDoc(doc(db, usersCol, uid, entriesCol, String(entry.anilistId)), {
    ...entry,
    syncedAt: serverTimestamp(),
  });
}

export async function deleteEntry(uid: string, anilistId: number): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, usersCol, uid, entriesCol, String(anilistId)));
}

export async function pullEntries(uid: string, since: number | null): Promise<LibraryEntry[]> {
  const db = requireFirestore();
  const base = collection(db, usersCol, uid, entriesCol);
  const snapshot = await getDocs(
    since === null ? query(base) : query(base, where('updatedAt', '>', since)),
  );
  return snapshot.docs.map((document) => document.data() as LibraryEntry);
}

export async function pushList(uid: string, list: CustomList): Promise<void> {
  const db = requireFirestore();
  await setDoc(doc(db, usersCol, uid, listsCol, list.id), list);
}

export async function deleteList(uid: string, listId: string): Promise<void> {
  const db = requireFirestore();
  await deleteDoc(doc(db, usersCol, uid, listsCol, listId));
}

export async function pullLists(uid: string): Promise<CustomList[]> {
  const db = requireFirestore();
  const snapshot = await getDocs(collection(db, usersCol, uid, listsCol));
  return snapshot.docs.map((document) => document.data() as CustomList);
}

export async function pushProfile(profile: UserProfile): Promise<void> {
  const db = requireFirestore();
  await setDoc(
    doc(db, usersCol, profile.uid),
    {
      displayName: profile.displayName,
      email: profile.email,
      createdAt: profile.createdAt,
      settings: profile.settings,
      linkedAccounts: profile.linkedAccounts,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function pushSettings(uid: string, settings: UserSettings): Promise<void> {
  const db = requireFirestore();
  await setDoc(doc(db, usersCol, uid), { settings, updatedAt: serverTimestamp() }, { merge: true });
}

export async function pullProfile(uid: string): Promise<Partial<UserProfile> | null> {
  const db = requireFirestore();
  const snapshot = await getDoc(doc(db, usersCol, uid));
  return snapshot.exists() ? (snapshot.data() as Partial<UserProfile>) : null;
}

/**
 * Account deletion must actually delete the data, not just the auth record -
 * a store requirement and a POPIA/GDPR requirement (§5, §12).
 */
export async function deleteAllUserData(uid: string): Promise<void> {
  const db = requireFirestore();

  for (const sub of [entriesCol, listsCol, devicesCol]) {
    // Firestore caps a batch at 500 writes, so delete in pages.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const snapshot = await getDocs(collection(db, usersCol, uid, sub));
      if (snapshot.empty) break;

      const chunk = snapshot.docs.slice(0, 450);
      const batch = writeBatch(db);
      for (const document of chunk) batch.delete(document.ref);
      await batch.commit();

      if (chunk.length === snapshot.docs.length) break;
    }
  }

  await deleteDoc(doc(db, usersCol, uid));
}
