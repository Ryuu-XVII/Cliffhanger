import { useRouter } from 'expo-router';
import React from 'react';

import { resolveTitle } from '@/data/titles';
import { useSettingsStore } from '@/stores/settingsStore';
import { Celebration } from '@/ui/Celebration';
import { useCelebrationStore } from './useProgressActions';

/**
 * Mounted once at the root so the completion moment can fire from anywhere -
 * the home card, a library card or the detail counter - without each screen
 * carrying its own copy of the overlay.
 */
export function CelebrationHost() {
  const entry = useCelebrationStore((state) => state.entry);
  const rewatchCount = useCelebrationStore((state) => state.rewatchCount);
  const hide = useCelebrationStore((state) => state.hide);
  const language = useSettingsStore((state) => state.settings.titleLanguage);
  const router = useRouter();

  return (
    <Celebration
      visible={entry !== null}
      title={entry ? resolveTitle(entry.snapshot.title, language) : ''}
      rewatchCount={rewatchCount}
      onDismiss={hide}
      onRate={
        entry
          ? () => {
              const id = entry.anilistId;
              hide();
              router.push({ pathname: '/entry/[id]', params: { id: String(id), focus: 'score' } });
            }
          : undefined
      }
    />
  );
}
