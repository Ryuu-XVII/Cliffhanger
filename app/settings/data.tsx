import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import {
  buildJsonExport,
  buildMalXmlExport,
  importFromAniList,
  importFromMalXml,
  shareExport,
  syncToAniList,
} from '@/features/data/importExport';
import { useAuthStore } from '@/stores/authStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { toast } from '@/stores/toastStore';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { ScreenHeader } from '@/ui/Header';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/**
 * F-20 import and F-21 export. Export is deliberately prominent: users must be
 * able to leave with their data, and burying that would be a dark pattern.
 */
export default function DataSettingsScreen() {
  const { colors } = useTheme();
  // Object.values() in a selector returns a new array every render, which
  // Zustand v5 reads as a changed snapshot - the same infinite loop that
  // crashed the library screen.
  const entryMap = useLibraryStore((state) => state.entries);
  const entries = useMemo(() => Object.values(entryMap), [entryMap]);
  const linked = useAuthStore((state) => state.linked);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await work();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  const spinner = (key: string) =>
    busy === key ? <ActivityIndicator color={colors.primary} /> : undefined;

  return (
    <Screen>
      <ScreenHeader title="Import and export" showBack />

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl * 2 }}>
        <View
          style={{
            marginHorizontal: spacing.gutter,
            padding: spacing.md,
            borderRadius: radii.md,
            backgroundColor: colors.surfaceContainerLow,
          }}
        >
          <Text variant="bodyMd">{`${entries.length} titles in your library`}</Text>
          <Text variant="labelSm" colour="onSurfaceVariant" style={{ marginTop: 4 }}>
            Exports include progress, scores, notes, rewatches and dates.
          </Text>
        </View>

        <Group title="Export">
          <Row
            icon="code-download-outline"
            label="Export as JSON"
            hint="Everything, exactly as stored"
            trailing={spinner('json')}
            onPress={() =>
              void run('json', async () => {
                await shareExport(
                  buildJsonExport(entries),
                  'cliffhanger-library.json',
                  'application/json',
                );
                toast.success('Exported');
              })
            }
          />
          <Row
            icon="document-outline"
            label="Export as MAL XML"
            hint="Imports into MyAnimeList and most trackers"
            trailing={spinner('xml')}
            onPress={() =>
              void run('xml', async () => {
                await shareExport(
                  buildMalXmlExport(entries),
                  'cliffhanger-mal-export.xml',
                  'application/xml',
                );
                toast.success('Exported');
              })
            }
          />
        </Group>

        <Group title="Import">
          <Row
            icon="cloud-download-outline"
            label="Import from AniList"
            hint={
              linked.anilist
                ? `Linked as ${linked.anilist.userName}`
                : 'Link your AniList account first'
            }
            trailing={spinner('anilist')}
            onPress={() =>
              void run('anilist', async () => {
                if (!linked.anilist) {
                  toast.error('Link AniList in Account settings first');
                  return;
                }
                const result = await importFromAniList();
                toast.success(
                  `${result.added} added, ${result.updated} updated, ${result.skipped} skipped`,
                );
              })
            }
          />
          <Row
            icon="sync-outline"
            label="Sync local changes to AniList"
            hint={linked.anilist ? 'Pushes progress, scores and notes' : 'Link your AniList account first'}
            trailing={spinner('anilist-push')}
            onPress={() =>
              void run('anilist-push', async () => {
                if (!linked.anilist) {
                  toast.error('Link AniList in Account settings first');
                  return;
                }
                const result = await syncToAniList(entries);
                toast.success(
                  `${result.pushed} synced${result.failed ? `, ${result.failed} failed` : ''}`,
                );
              })
            }
          />
          <Row
            icon="folder-open-outline"
            label="Import a MAL XML file"
            hint="From a MyAnimeList export"
            trailing={spinner('mal')}
            onPress={() =>
              void run('mal', async () => {
                const picked = await DocumentPicker.getDocumentAsync({
                  type: ['application/xml', 'text/xml', '*/*'],
                  copyToCacheDirectory: true,
                });
                if (picked.canceled || !picked.assets?.[0]) return;

                const file = new File(picked.assets[0].uri);
                const xml = file.textSync();
                const result = await importFromMalXml(xml);

                toast.success(`${result.added} added, ${result.updated} updated`);
                if (result.unresolved.length > 0) {
                  toast.show(
                    `${result.unresolved.length} titles had no AniList match and were skipped`,
                    'warning',
                  );
                }
              })
            }
          />
        </Group>

        <Text
          variant="labelSm"
          colour="onSurfaceVariant"
          style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.lg }}
        >
          Imports are idempotent. Running the same import twice updates your entries in place; it
          never creates duplicates.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text
        variant="labelLg"
        colour="onSurfaceVariant"
        uppercase
        style={{ paddingHorizontal: spacing.gutter, marginBottom: spacing.sm }}
      >
        {title}
      </Text>
      <View style={{ marginHorizontal: spacing.gutter, borderRadius: radii.md, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}
