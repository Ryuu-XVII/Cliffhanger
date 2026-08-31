import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { STATUS_LABELS, STATUS_ORDER } from '@/data/models';
import { resolveTitle } from '@/data/titles';
import { ScorePicker } from '@/features/entry/ScorePicker';
import { useProgressActions } from '@/features/progress/useProgressActions';
import { totalUnits, unitNoun, unitNounCapitalised, useLibraryStore } from '@/stores/libraryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { hairline, radii, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDate } from '@/utils/time';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Cover } from '@/ui/Cover';
import { EpisodeCounter } from '@/ui/Incrementer';
import { StatusPill } from '@/ui/Indicators';
import { Screen } from '@/ui/Screen';
import { EmptyState } from '@/ui/States';
import { Text } from '@/ui/Text';

/**
 * The edit sheet: state, progress, score, notes, rewatches, dates, custom lists
 * and the per-title airing toggle. Everything writes through immediately -
 * there is no Save button to forget, and the undo toast covers mistakes.
 */
export default function EditEntryScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const anilistId = Number(id);
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const entry = useLibraryStore((state) => state.entries[String(anilistId)] ?? null);
  const lists = useLibraryStore((state) => state.lists);
  const update = useLibraryStore((state) => state.update);
  const setStatus = useLibraryStore((state) => state.setStatus);
  const setScore = useLibraryStore((state) => state.setScore);
  const toggleListMembership = useLibraryStore((state) => state.toggleListMembership);
  const { logEpisode, setEpisode } = useProgressActions();

  const settings = useSettingsStore((state) => state.settings);
  const notesRef = useRef<TextInput>(null);
  const [notes, setNotes] = useState(entry?.notes ?? '');

  useEffect(() => {
    if (focus === 'notes') setTimeout(() => notesRef.current?.focus(), 300);
  }, [focus]);

  // Notes are debounced so a long note is not one write per keystroke.
  useEffect(() => {
    if (!entry || notes === entry.notes) return;
    const timer = setTimeout(() => update(anilistId, { notes }), 500);
    return () => clearTimeout(timer);
  }, [notes, entry, anilistId, update]);

  if (!entry) {
    return (
      <Screen>
        <View style={{ paddingTop: insets.top + spacing.lg }}>
          <EmptyState
            icon="help-circle-outline"
            title="Not in your library"
            message="Add this title first, then you can edit its entry."
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  const title = resolveTitle(entry.snapshot.title, settings.titleLanguage);
  const total = totalUnits(entry);
  const noun = unitNoun(entry, true);
  const nounCapitalised = unitNounCapitalised(entry, true);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.gutter }}>
          <Cover uri={entry.snapshot.coverImage} width={52} height={78} radius={radii.sm} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text variant="headlineSm" numberOfLines={2}>
              {title}
            </Text>
            <StatusPill status={entry.status} style={{ marginTop: spacing.xs }} />
          </View>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>

        <Section title="Progress">
          <EpisodeCounter
            progress={entry.progress}
            total={total}
            unit={nounCapitalised}
            onIncrement={() => logEpisode(anilistId)}
            onDecrement={() => setEpisode(anilistId, entry.progress - 1)}
          />
          {total ? (
            <Button
              label={`Mark all ${total} ${noun} watched`}
              variant="tertiary"
              onPress={() => setEpisode(anilistId, total)}
            />
          ) : null}
        </Section>

        <Section title="List">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {STATUS_ORDER.map((status) => (
              <Chip
                key={status}
                label={STATUS_LABELS[status]}
                selected={entry.status === status}
                onPress={() => {
                  setStatus(anilistId, status);
                  toast.show(`Moved to ${STATUS_LABELS[status].toLowerCase()}`, 'success');
                }}
              />
            ))}
          </View>
        </Section>

        <Section title="Score">
          <ScorePicker
            score={entry.score}
            format={settings.scoreFormat}
            onChange={(value) => setScore(anilistId, value)}
          />
        </Section>

        <Section title="Notes">
          <TextInput
            ref={notesRef}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Private notes. Only you see these."
            placeholderTextColor={colors.outline}
            accessibilityLabel="Notes"
            style={{
              minHeight: 96,
              padding: spacing.md,
              borderRadius: radii.md,
              backgroundColor: colors.surfaceContainerLow,
              color: colors.onSurface,
              fontFamily: 'HankenGrotesk_400Regular',
              fontSize: 16,
              textAlignVertical: 'top',
            }}
          />
        </Section>

        <Section title="Rewatches">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <StepPill
              icon="remove"
              label="Fewer rewatches"
              disabled={entry.rewatches <= 0}
              onPress={() => update(anilistId, { rewatches: Math.max(0, entry.rewatches - 1) })}
            />
            <Text variant="headlineMd" style={{ marginHorizontal: spacing.lg }}>
              {String(entry.rewatches)}
            </Text>
            <StepPill
              icon="add"
              label="More rewatches"
              onPress={() => update(anilistId, { rewatches: entry.rewatches + 1 })}
            />

            <View style={{ flex: 1 }} />
            {entry.status === 'COMPLETED' ? (
              <Button
                label="Rewatch it"
                variant="secondary"
                onPress={() => {
                  setStatus(anilistId, 'REWATCHING');
                  toast.show('Rewatching from the start', 'success');
                }}
              />
            ) : null}
          </View>
        </Section>

        {lists.length > 0 ? (
          <Section title="Custom lists">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {lists.map((list) => (
                <Chip
                  key={list.id}
                  label={list.name}
                  selected={entry.customListIds.includes(list.id)}
                  onPress={() => toggleListMembership(anilistId, list.id)}
                />
              ))}
            </View>
          </Section>
        ) : null}

        <Section title="Dates">
          <MetaRow label="Started" value={formatDate(entry.startedAt)} />
          <MetaRow label="Completed" value={formatDate(entry.completedAt)} />
          <MetaRow label="Last updated" value={formatDate(entry.updatedAt)} />
        </Section>

        <Section title="Alerts">
          <ToggleRow
            label="Notify me when an episode airs"
            hint={
              entry.notify === null
                ? `Following your default (${settings.notifyOnAiringDefault ? 'on' : 'off'})`
                : undefined
            }
            value={entry.notify ?? settings.notifyOnAiringDefault}
            onChange={(value) => update(anilistId, { notify: value })}
          />
          <ToggleRow
            label="Keep this entry private"
            value={entry.private}
            onChange={(value) => update(anilistId, { private: value })}
          />
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: spacing.gutter, marginTop: spacing.xl }}>
      <Text variant="labelLg" colour="onSurfaceVariant" uppercase style={{ marginBottom: spacing.sm }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: hairline,
      }}
    >
      <Text variant="bodyMd" colour="onSurfaceVariant">
        {label}
      </Text>
      <Text variant="bodyMd">{value}</Text>
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm }}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text variant="bodyMd">{label}</Text>
        {hint ? (
          <Text variant="labelSm" colour="onSurfaceVariant">
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: colors.surfaceContainerHighest, true: colors.primaryContainer }}
        thumbColor={value ? colors.primary : colors.outline}
      />
    </View>
  );
}

function StepPill({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: 'add' | 'remove';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={{
        width: 44,
        height: 44,
        borderRadius: radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceContainerHigh,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Ionicons name={icon} size={20} color={colors.onSurface} />
    </Pressable>
  );
}
