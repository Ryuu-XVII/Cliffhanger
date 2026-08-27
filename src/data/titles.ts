import type { TitleLanguage, TitleSet } from './models';

/**
 * §4.6 - one resolver for the whole app, notifications included. A title with
 * no entry in the preferred language falls back romaji then english then
 * native, so a card never renders blank.
 */
export function resolveTitle(
  title: TitleSet | null | undefined,
  language: TitleLanguage,
): string {
  if (!title) return 'Untitled';

  const order: Record<TitleLanguage, Array<keyof TitleSet>> = {
    romaji: ['romaji', 'english', 'native'],
    english: ['english', 'romaji', 'native'],
    native: ['native', 'romaji', 'english'],
  };

  for (const key of order[language]) {
    const value = title[key];
    if (value && value.trim().length > 0) return value;
  }
  return 'Untitled';
}

/** Secondary line: show the other title when it differs meaningfully. */
export function resolveAlternateTitle(
  title: TitleSet | null | undefined,
  language: TitleLanguage,
): string | null {
  if (!title) return null;
  const primary = resolveTitle(title, language);
  const candidates =
    language === 'english' ? [title.romaji, title.native] : [title.english, title.native];
  for (const candidate of candidates) {
    if (candidate && candidate.trim() && candidate !== primary) return candidate;
  }
  return null;
}

export function emptyTitleSet(): TitleSet {
  return { romaji: null, english: null, native: null };
}
