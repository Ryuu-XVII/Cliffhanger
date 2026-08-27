import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { ScrollView, View } from 'react-native';

import type {
  AniListCharacterEdge,
  AniListMediaLite,
  AniListRelationEdge,
  AniListStaffEdge,
} from '@/api/anilist/types';
import type { StreamingOption } from '@/api/streaming';
import { relationLabel } from '@/data/transforms';
import { resolveTitle } from '@/data/titles';
import { useSettingsStore } from '@/stores/settingsStore';
import { radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Cover } from '@/ui/Cover';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

/** F-02 related entries: sequels, prequels, side stories. */
export function RelationsRail({ edges }: { edges: AniListRelationEdge[] | null | undefined }) {
  const router = useRouter();
  const language = useSettingsStore((state) => state.settings.titleLanguage);

  const valid = (edges ?? []).filter(
    (edge): edge is AniListRelationEdge & { node: AniListMediaLite } =>
      edge.node !== null && edge.node !== undefined,
  );
  if (valid.length === 0) return null;

  return (
    <RailShell title="Related entries">
      {valid.map((edge) => (
        <PressableScale
          key={edge.node.id + ':' + (edge.relationType ?? '')}
          onPress={() =>
            router.push({ pathname: '/title/[id]', params: { id: String(edge.node.id) } })
          }
          radiusFrom={radii.md}
          radiusTo={radii.lg}
          accessibilityLabel={
            resolveTitle(edge.node.title, language) + ', ' + relationLabel(edge.relationType)
          }
          style={{ width: 124 }}
        >
          <Cover
            uri={edge.node.coverImage?.large ?? edge.node.coverImage?.extraLarge ?? null}
            width={124}
            height={186}
            radius={radii.md}
          />
          <Text variant="bodyMd" numberOfLines={1} style={{ marginTop: spacing.sm }}>
            {resolveTitle(edge.node.title, language)}
          </Text>
          <Text variant="labelSm" colour="onSurfaceVariant" numberOfLines={1}>
            {relationLabel(edge.relationType)}
          </Text>
        </PressableScale>
      ))}
    </RailShell>
  );
}

/** F-26 recommendations - AniList's own edges, no ML anywhere near it. */
export function RecommendationsRail({ items }: { items: AniListMediaLite[] }) {
  const router = useRouter();
  const language = useSettingsStore((state) => state.settings.titleLanguage);
  if (items.length === 0) return null;

  return (
    <RailShell title="If you liked this">
      {items.map((media) => (
        <PressableScale
          key={media.id}
          onPress={() => router.push({ pathname: '/title/[id]', params: { id: String(media.id) } })}
          radiusFrom={radii.md}
          radiusTo={radii.lg}
          accessibilityLabel={resolveTitle(media.title, language)}
          style={{ width: 124 }}
        >
          <Cover
            uri={media.coverImage?.large ?? media.coverImage?.extraLarge ?? null}
            width={124}
            height={186}
            radius={radii.md}
          />
          <Text variant="bodyMd" numberOfLines={2} style={{ marginTop: spacing.sm }}>
            {resolveTitle(media.title, language)}
          </Text>
        </PressableScale>
      ))}
    </RailShell>
  );
}

/** F-29 characters and their voice actors. */
export function CharactersRail({ edges }: { edges: AniListCharacterEdge[] | null | undefined }) {
  const valid = (edges ?? []).filter((edge) => edge.node !== null);
  if (valid.length === 0) return null;

  return (
    <RailShell title="Characters">
      {valid.map((edge) => {
        const actor = edge.voiceActors?.find((voice) => voice.languageV2 === 'Japanese') ?? edge.voiceActors?.[0];
        return (
          <View key={edge.node?.id} style={{ width: 104 }}>
            <Cover
              uri={edge.node?.image?.large ?? null}
              width={104}
              height={140}
              radius={radii.md}
              accessibilityLabel={edge.node?.name?.full ?? 'Character'}
            />
            <Text variant="bodyMd" numberOfLines={2} style={{ marginTop: spacing.sm }}>
              {edge.node?.name?.full ?? 'Unknown'}
            </Text>
            {actor?.name?.full ? (
              <Text variant="labelSm" colour="onSurfaceVariant" numberOfLines={1}>
                {actor.name.full}
              </Text>
            ) : null}
          </View>
        );
      })}
    </RailShell>
  );
}

/** F-29 staff browsing: show the main credits returned by AniList. */
export function StaffRail({ edges }: { edges: AniListStaffEdge[] | null | undefined }) {
  const valid = (edges ?? []).filter((edge) => edge.node !== null);
  if (valid.length === 0) return null;

  return (
    <RailShell title="Staff">
      {valid.map((edge) => (
        <View key={edge.node?.id + ':' + (edge.role ?? '')} style={{ width: 112 }}>
          <Cover
            uri={edge.node?.image?.large ?? null}
            width={112}
            height={144}
            radius={radii.md}
            accessibilityLabel={edge.node?.name?.full ?? 'Staff member'}
          />
          <Text variant="bodyMd" numberOfLines={2} style={{ marginTop: spacing.sm }}>
            {edge.node?.name?.full ?? 'Unknown'}
          </Text>
          <Text variant="labelSm" colour="onSurfaceVariant" numberOfLines={2}>
            {edge.role ?? 'Staff'}
          </Text>
        </View>
      ))}
    </RailShell>
  );
}

/**
 * F-22 streaming availability. These are official licensor links from AniList
 * only - the app never links to an unlicensed source (§1 non-goals, §12 store
 * compliance) and never embeds video.
 */
export function StreamingRow({ options }: { options: StreamingOption[] }) {
  const { colors } = useTheme();
  if (options.length === 0) return null;

  return (
    <RailShell title="Where to watch" subtitle="Official services, where licensed in your region">
      {options.map((option) => (
        <PressableScale
          key={option.id}
          onPress={() => void WebBrowser.openBrowserAsync(option.url)}
          scaleTo={0.95}
          rotateTo={0}
          accessibilityLabel={'Open ' + option.label}
          accessibilityHint="Opens the streaming service in your browser"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: spacing.sm + 2,
            paddingHorizontal: spacing.md,
            borderRadius: radii.full,
            backgroundColor: colors.surfaceContainerHigh,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: option.colour,
              marginRight: spacing.sm,
            }}
          />
          <Text variant="labelLg">{option.label}</Text>
          <Ionicons
            name="open-outline"
            size={13}
            color={colors.onSurfaceVariant}
            style={{ marginLeft: spacing.sm }}
          />
        </PressableScale>
      ))}
    </RailShell>
  );
}

function RailShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text variant="displayLgMobile" style={{ paddingHorizontal: spacing.gutter }}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          variant="labelSm"
          colour="onSurfaceVariant"
          style={{ paddingHorizontal: spacing.gutter, marginTop: 2 }}
        >
          {subtitle}
        </Text>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.gutter,
          paddingTop: spacing.md,
          gap: spacing.sm + 4,
          alignItems: 'flex-start',
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}
