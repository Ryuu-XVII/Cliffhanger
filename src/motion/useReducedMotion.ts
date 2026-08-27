import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { useSettingsStore } from '@/stores/settingsStore';

/**
 * §9 constraint: every animation needs a reduced fallback.
 * Sources are OR'd — the OS switch or the in-app override both count.
 */
export function useReducedMotion(): boolean {
  const [osReduced, setOsReduced] = useState(false);
  const appReduced = useSettingsStore((s) => s.settings.reduceMotion);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (alive) setOsReduced(enabled);
      })
      .catch(() => {
        /* Platform without the API — treat as "motion allowed". */
      });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setOsReduced(enabled);
    });

    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return osReduced || appReduced;
}

/** Screen-reader state, used to swap gesture-only affordances for buttons. */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => {
        if (alive) setEnabled(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return enabled;
}
