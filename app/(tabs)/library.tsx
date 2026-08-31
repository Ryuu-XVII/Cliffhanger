import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { STATUS_LABELS, STATUS_ORDER, type ListStatus } from '@/data/models';
import { LibraryCard } from '@/features/library/components/LibraryCard';
import { LibraryRow } from '@/features/library/components/LibraryRow';
import { SyncBanner } from '@/features/library/components/SyncBanner';
import {
  SORT_LABELS,
  useLibraryView,
  useLibraryViewStore,
  type SortKey,
} from '@/features/library/hooks/useLibraryView';
import { displayName, useAuthStore } from '@/stores/authStore';
import { countByStatus, useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { aspect, hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Chip } from '@/ui/Chip';
import { ScreenHeader } from '@/ui/Header';
import { Screen, useTabBarClearance } from '@/ui/Screen';
import { SegmentedTabs } from '@/ui/SegmentedTabs';
import { Sheet } from '@/ui/Sheet';
import { EmptyState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * F-07. A wall of art, not a wall of grey cards (§10) - gutters are tight so
 * the covers do the talking, and the chrome above them stays quiet.
 */

/** Cover height plus the title/progress block beneath it, per grid row. */
const CARD_CAPTION_HEIGHT = 70;

export default function LibraryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const clearance = useTabBarClearance();

  const name = useAuthStore(displayName);

  // Select the stable entries map, then derive - see countByStatus.
  const allEntriesMap = useLibraryStore((state) => state.entries);
  const counts = useMemo(() => countByStatus(allEntriesMap), [allEntriesMap]);
  const lists = useLibraryStore((state) => state.lists);
  const sync = useLibraryStore((state) => state.sync);
  const layout = useSettingsStore((state) => state.settings.libraryLayout);
  const updateSettings = useSettingsStore((state) => state.update);

  const view = useLibraryViewStore();
  const { entries, total } = useLibraryView();

  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Two columns with an 8px gutter - the "media density" rule in DESIGN.md.
  const columns = width >= 700 ? 4 : 2;
  const gutter = spacing.sm;
  const cardWidth = (width - spacing.gutter * 2 - gutter * (columns - 1)) / columns;

  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const entry of Object.values(allEntriesMap)) {
      for (const genre of entry.snapshot.genres) set.add(genre);
    }
    return Array.from(set).sort();
  }, [allEntriesMap]);

  const renderItem = useCallback(
    ({ item, index }: { item: (typeof entries)[number]; index: number }) => {
      if (layout === 'list') return <LibraryRow entry={item} />;
      return (
        <LibraryCard
          entry={item}
          width={cardWidth}
          scrollY={scrollY}
          itemOffset={Math.floor(index / columns) * (cardWidth / aspect.cover + CARD_CAPTION_HEIGHT)}
          style={{
            marginBottom: spacing.lg,
            marginRight: (index + 1) % columns === 0 ? 0 : gutter,
          }}
        />
      );
    },
    [layout, cardWidth, columns, gutter, scrollY],
  );

  return (
    <Screen>
      <ScreenHeader title="Library" onAvatarPress={() => router.push('/(tabs)/profile')} avatarLabel={name} />

      <SegmentedTabs<ListStatus>
        options={STATUS_ORDER.map((status) => ({
          value: status,
          label: STATUS_LABELS[status],
          badge: counts[status],
        }))}
        value={view.status}
        onChange={view.setStatus}
        accessibilityLabel="Filter by list"
        style={{ marginBottom: spacing.md }}
      />

      <View style={toolbarRowStyle}>
        <Text variant="labelLg" colour="onSurfaceVariant" uppercase style={{ flex: 1 }}>
          {`${total} ${total === 1 ? 'item' : 'items'}`}
        </Text>

        <IconButton
          icon={layout === 'grid' ? 'list-outline' : 'grid-outline'}
          label={layout === 'grid' ? 'Switch to list layout' : 'Switch to grid layout'}
          onPress={() => updateSettings({ libraryLayout: layout === 'grid' ? 'list' : 'grid' })}
        />
        <IconButton
          icon="funnel-outline"
          label="Filter"
          active={view.listId !== null || view.genre !== null}
          onPress={() => setFilterOpen(true)}
        />
        <IconButton icon="swap-vertical-outline" label="Sort" onPress={() => setSortOpen(true)} />
      </View>

      <Animated.FlatList
        data={entries}
        keyExtractor={(item) => String(item.anilistId)}
        renderItem={renderItem}
        numColumns={layout === 'grid' ? columns : 1}
        key={`${layout}:${columns}`}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onRefresh={() => void sync()}
        refreshing={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.gutter,
          paddingBottom: clearance,
          paddingTop: spacing.xs,
        }}
        ListHeaderComponent={<SyncBanner />}
        ListEmptyComponent={
          <EmptyState
            icon="albums-outline"
            title={`Nothing in ${STATUS_LABELS[view.status].toLowerCase()}`}
            message={
              view.status === 'WATCHING'
                ? 'Add a series here and it lands on your home screen with a plus button.'
                : 'Move titles into this list from any detail screen.'
            }
            actionLabel="Find something"
            onAction={() => router.push('/search')}
          />
        }
        removeClippedSubviews
        initialNumToRender={8}
        windowSize={9}
      />

      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => {
              view.setSort(key);
              setSortOpen(false);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: view.sort === key }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: hairline,
            }}
          >
            <Text variant="bodyLg" style={{ flex: 1 }}>
              {SORT_LABELS[key]}
            </Text>
            {view.sort === key ? (
              <Ionicons name="checkmark" size={20} color={colors.primary} />
            ) : null}
          </Pressable>
        ))}

        <Pressable
          onPress={view.toggleDirection}
          accessibilityRole="button"
          accessibilityLabel={view.descending ? 'Sort ascending' : 'Sort descending'}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md }}
        >
          <Ionicons
            name={view.descending ? 'arrow-down' : 'arrow-up'}
            size={18}
            color={colors.primary}
          />
          <Text variant="bodyMd" colour={colors.primary} style={{ marginLeft: spacing.sm }}>
            {view.descending ? 'Descending' : 'Ascending'}
          </Text>
        </Pressable>
      </Sheet>

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filter">
        <Text variant="labelLg" colour="onSurfaceVariant" uppercase>
          Custom lists
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
          <Chip label="All" selected={view.listId === null} onPress={() => view.setListId(null)} />
          {lists.map((list) => (
            <Chip
              key={list.id}
              label={list.name}
              selected={view.listId === list.id}
              onPress={() => view.setListId(list.id)}
            />
          ))}
          {lists.length === 0 ? (
            <Text variant="bodyMd" colour="onSurfaceVariant">
              No custom lists yet.
            </Text>
          ) : null}
        </View>

        <Text variant="labelLg" colour="onSurfaceVariant" uppercase style={{ marginTop: spacing.lg }}>
          Genre
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
          <Chip label="Any" selected={view.genre === null} onPress={() => view.setGenre(null)} />
          {genres.map((genre) => (
            <Chip
              key={genre}
              label={genre}
              compact
              selected={view.genre === genre}
              onPress={() => view.setGenre(view.genre === genre ? null : genre)}
            />
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{
        width: 38,
        height: 38,
        borderRadius: radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: spacing.sm,
        backgroundColor: colors.surfaceContainerHigh,
      }}
    >
      <Ionicons name={icon} size={18} color={active ? colors.primary : colors.onSurface} />
    </Pressable>
  );
}

const toolbarRowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  paddingHorizontal: spacing.gutter,
  marginBottom: spacing.md,
};
