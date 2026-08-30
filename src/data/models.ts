/**
 * §8 data model. `anilistId` is the canonical key everywhere — never a title
 * string (§4.6). Scores are always stored 0–100 and converted for display only.
 */

export const LIST_STATUSES = [
  'WATCHING',
  'PLANNING',
  'COMPLETED',
  'ON_HOLD',
  'DROPPED',
  'REWATCHING',
] as const;

export type ListStatus = (typeof LIST_STATUSES)[number];

export type TitleLanguage = 'romaji' | 'english' | 'native';
export type ScoreFormat = 'POINT_10' | 'POINT_100' | 'POINT_5';
export type ThemeId = 'obsidian' | 'oled';
export type MediaType = 'ANIME' | 'MANGA';

export interface TitleSet {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

/** Denormalised snapshot so the library renders instantly and offline (§4.5.3). */
export interface EntrySnapshot {
  title: TitleSet;
  coverImage: string | null;
  bannerImage: string | null;
  totalEpisodes: number | null;
  format: string | null;
  airingStatus: string | null;
  /** Unix seconds for the next known episode, used by library sorting. */
  nextAiringAt?: number | null;
  genres: string[];
  averageScore: number | null;
  /** Present for MANGA entries (F-25). */
  totalChapters?: number | null;
  totalVolumes?: number | null;
}

export interface LibraryEntry {
  anilistId: number;
  malId: number | null;
  mediaType: MediaType;
  status: ListStatus;
  /** Episodes watched — or chapters read for manga (F-25). */
  progress: number;
  /** Volumes read, manga only. */
  progressVolumes?: number;
  /** Always 0-100, or null for unscored. */
  score: number | null;
  rewatches: number;
  notes: string;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
  customListIds: string[];
  /** Per-title airing notification override; null = follow the global default. */
  notify: boolean | null;
  private: boolean;
  snapshot: EntrySnapshot;
}

export interface CustomList {
  id: string;
  name: string;
  order: number;
  createdAt: number;
}

/** Opt-in sharing primitives. No social data is public unless a user creates
 * a share link; private fields and account identifiers are never included. */
export type SharedListVisibility = 'PRIVATE' | 'LINK' | 'FRIENDS';

export interface SharedList {
  id: string;
  ownerUid: string;
  sourceListId: string;
  title: string;
  visibility: SharedListVisibility;
  anilistIds: number[];
  createdAt: number;
  updatedAt: number;
}

export interface ActivityEvent {
  id: string;
  ownerUid: string;
  type: 'LIST_SHARED' | 'PROGRESS_MILESTONE' | 'TITLE_RECOMMENDED';
  titleId?: number;
  sharedListId?: string;
  createdAt: number;
}

export interface QuietHours {
  /** 24h "HH:mm" in the local timezone of the device. */
  start: string;
  end: string;
}

export interface UserSettings {
  titleLanguage: TitleLanguage;
  scoreFormat: ScoreFormat;
  theme: ThemeId;
  accent: 'amethyst' | 'sunset' | 'cyan' | 'matcha';
  notificationsEnabled: boolean;
  /** Default for newly added WATCHING entries. Planning defaults off (§15). */
  notifyOnAiringDefault: boolean;
  quietHours: QuietHours | null;
  reduceMotion: boolean;
  hapticsEnabled: boolean;
  /** Region code used for streaming availability lookups (F-22). */
  streamingRegion: string;
  libraryLayout: 'grid' | 'list';
  showAdult: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  titleLanguage: 'english',
  scoreFormat: 'POINT_10',
  theme: 'obsidian',
  accent: 'amethyst',
  // Off until the user explicitly opts in during onboarding (app/onboarding.tsx) -
  // requesting the OS notification permission before the user has asked for
  // anything is exactly the pattern that gets an app's permission prompt
  // reflexively denied.
  notificationsEnabled: false,
  notifyOnAiringDefault: false,
  quietHours: null,
  reduceMotion: false,
  hapticsEnabled: true,
  streamingRegion: 'ZA',
  libraryLayout: 'grid',
  showAdult: false,
};

export interface LinkedAccounts {
  anilist: { userId: number; userName: string; linkedAt: number } | null;
  mal: { username: string; linkedAt: number } | null;
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  isAnonymous: boolean;
  createdAt: number;
  settings: UserSettings;
  linkedAccounts: LinkedAccounts;
}

export const STATUS_LABELS: Record<ListStatus, string> = {
  WATCHING: 'Watching',
  PLANNING: 'Planning',
  COMPLETED: 'Completed',
  ON_HOLD: 'On hold',
  DROPPED: 'Dropped',
  REWATCHING: 'Rewatching',
};

/** Order the library tabs appear in - matches the design screenshots. */
export const STATUS_ORDER: ListStatus[] = [
  'WATCHING',
  'PLANNING',
  'COMPLETED',
  'ON_HOLD',
  'DROPPED',
  'REWATCHING',
];

export function emptyEntry(anilistId: number, snapshot: EntrySnapshot): LibraryEntry {
  return {
    anilistId,
    malId: null,
    mediaType: 'ANIME',
    status: 'PLANNING',
    progress: 0,
    score: null,
    rewatches: 0,
    notes: '',
    startedAt: null,
    completedAt: null,
    updatedAt: Date.now(),
    customListIds: [],
    notify: null,
    private: false,
    snapshot,
  };
}
