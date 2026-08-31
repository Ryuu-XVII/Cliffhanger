import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';

import { useLibraryStore } from '@/stores/libraryStore';
import { shareExport } from '@/features/data/importExport';
import { toast } from '@/stores/toastStore';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { ScreenHeader } from '@/ui/Header';
import { Screen } from '@/ui/Screen';
import { EmptyState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * F-18 custom lists. They sit alongside the six standard states rather than
 * replacing them, so an entry is always in exactly one state and any number of
 * custom lists.
 */
export default function ListsScreen() {
  const { colors } = useTheme();
  const lists = useLibraryStore((state) => state.lists);
  const entries = useLibraryStore((state) => state.entries);
  const createList = useLibraryStore((state) => state.createList);
  const renameList = useLibraryStore((state) => state.renameList);
  const deleteList = useLibraryStore((state) => state.deleteList);

  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const countFor = (listId: string): number =>
    Object.values(entries).filter((entry) => entry.customListIds.includes(listId)).length;

  const create = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    if (lists.some((list) => list.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('You already have a list with that name');
      return;
    }
    createList(trimmed);
    setName('');
    toast.success('List created');
  };

  const confirmDelete = (id: string, listName: string) => {
    Alert.alert(
      `Delete "${listName}"?`,
      'The titles stay in your library. Only the list goes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteList(id);
            toast.show('List deleted');
          },
        },
      ],
    );
  };

  const shareList = async (listId: string, listName: string) => {
    const selected = Object.values(entries).filter((entry) => entry.customListIds.includes(listId));
    const payload = JSON.stringify({
      format: 'cliffhanger-shared-list',
      version: 1,
      list: { id: listId, title: listName, createdAt: Date.now() },
      entries: selected.map((entry) => ({
        anilistId: entry.anilistId,
        mediaType: entry.mediaType,
        title: entry.snapshot.title,
        coverImage: entry.snapshot.coverImage,
      })),
    }, null, 2);
    await shareExport(payload, `cliffhanger-${listId}.json`, 'application/json');
    toast.success('Private list export ready to share');
  };

  return (
    <Screen>
      <ScreenHeader title="Custom lists" showBack />

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl * 2 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.gutter }}>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={create}
            placeholder="Comfort rewatches"
            placeholderTextColor={colors.outline}
            returnKeyType="done"
            accessibilityLabel="New list name"
            style={{
              flex: 1,
              height: 48,
              paddingHorizontal: spacing.md,
              borderRadius: radii.DEFAULT,
              backgroundColor: colors.surfaceContainerLow,
              borderWidth: 1,
              borderColor: hairline,
              color: colors.onSurface,
              fontFamily: 'HankenGrotesk_400Regular',
              fontSize: 16,
            }}
          />
          <Button label="Add" onPress={create} />
        </View>

        {lists.length === 0 ? (
          <EmptyState
            icon="bookmarks-outline"
            title="No custom lists"
            message="Make one for the things the standard lists cannot express. Comfort rewatches. Movies with my brother."
          />
        ) : (
          <View style={{ marginTop: spacing.lg }}>
            {lists.map((list) => {
              const count = countFor(list.id);
              return (
                <View
                  key={list.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginHorizontal: spacing.gutter,
                    marginBottom: spacing.sm,
                    padding: spacing.md,
                    borderRadius: radii.md,
                    backgroundColor: colors.surfaceContainerLow,
                  }}
                >
                  {editing === list.id ? (
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      autoFocus
                      onBlur={() => {
                        if (draft.trim()) renameList(list.id, draft);
                        setEditing(null);
                      }}
                      onSubmitEditing={() => {
                        if (draft.trim()) renameList(list.id, draft);
                        setEditing(null);
                      }}
                      accessibilityLabel={`Rename ${list.name}`}
                      style={{
                        flex: 1,
                        color: colors.onSurface,
                        fontFamily: 'HankenGrotesk_400Regular',
                        fontSize: 16,
                      }}
                    />
                  ) : (
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMd">{list.name}</Text>
                      <Text variant="labelSm" colour="onSurfaceVariant">
                        {`${count} ${count === 1 ? 'title' : 'titles'}`}
                      </Text>
                    </View>
                  )}

                  <Pressable
                    onPress={() => void shareList(list.id, list.name)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${list.name}`}
                    style={{ padding: spacing.sm }}
                  >
                    <Ionicons name="share-outline" size={18} color={colors.primary} />
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setDraft(list.name);
                      setEditing(list.id);
                    }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Rename ${list.name}`}
                    style={{ padding: spacing.sm }}
                  >
                    <Ionicons name="pencil-outline" size={18} color={colors.onSurfaceVariant} />
                  </Pressable>

                  <Pressable
                    onPress={() => confirmDelete(list.id, list.name)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${list.name}`}
                    style={{ padding: spacing.sm }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
