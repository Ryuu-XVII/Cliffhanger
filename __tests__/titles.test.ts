import { resolveAlternateTitle, resolveTitle } from '@/data/titles';

const full = { romaji: 'Sousou no Frieren', english: "Frieren: Beyond Journey's End", native: '葬送のフリーレン' };

describe('title resolution', () => {
  it('honours the preferred language', () => {
    expect(resolveTitle(full, 'romaji')).toBe('Sousou no Frieren');
    expect(resolveTitle(full, 'english')).toBe("Frieren: Beyond Journey's End");
    expect(resolveTitle(full, 'native')).toBe('葬送のフリーレン');
  });

  it('falls back when the preferred language is missing', () => {
    const noEnglish = { ...full, english: null };
    expect(resolveTitle(noEnglish, 'english')).toBe('Sousou no Frieren');
  });

  it('falls back again when only the native title exists', () => {
    const nativeOnly = { romaji: null, english: null, native: '葬送のフリーレン' };
    expect(resolveTitle(nativeOnly, 'english')).toBe('葬送のフリーレン');
  });

  it('never renders blank for an empty string', () => {
    expect(resolveTitle({ romaji: '   ', english: null, native: null }, 'romaji')).toBe('Untitled');
    expect(resolveTitle(null, 'romaji')).toBe('Untitled');
  });

  it('offers a meaningfully different alternate title', () => {
    expect(resolveAlternateTitle(full, 'romaji')).toBe("Frieren: Beyond Journey's End");
    const same = { romaji: 'Bleach', english: 'Bleach', native: null };
    expect(resolveAlternateTitle(same, 'romaji')).toBeNull();
  });
});
