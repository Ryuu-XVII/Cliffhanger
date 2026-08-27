import { useRouter } from 'expo-router';
import React from 'react';

import { Screen } from '@/ui/Screen';
import { ScreenHeader } from '@/ui/Header';
import { EmptyState } from '@/ui/States';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenHeader title="Lost" showBack />
      <EmptyState
        icon="compass-outline"
        title="That screen does not exist"
        message="The link you followed points somewhere the app does not have."
        actionLabel="Go home"
        onAction={() => router.replace('/(tabs)')}
      />
    </Screen>
  );
}
