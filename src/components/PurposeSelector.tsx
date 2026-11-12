import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors, PurposeColors } from '../constants/colors';
import { PURPOSES, PURPOSE_ORDER } from '../constants/purposes';
import type { CalendarEvent, PurposeId } from '../types';

interface PurposeSelectorProps {
  purposeId: PurposeId | null;
  onSelect: (id: PurposeId | null) => void;
  autoDetected: boolean;
  autoDetectedEvent: CalendarEvent | null;
}

interface ChipProps {
  active: boolean;
  activeColor: string;
  onPress: () => void;
  label: string; // 화면 낭독기용 — 이모지를 뺀 이름
  children: React.ReactNode;
}

function Chip({ active, activeColor, onPress, label, children }: ChipProps) {
  const scale = useRef(new Animated.Value(active ? 1.05 : 1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: active ? 1.05 : 1,
      useNativeDriver: true,
      friction: 6,
      tension: 80,
    }).start();
  }, [active, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ checked: active }}
        accessibilityLabel={label}
        style={[
          styles.chip,
          active
            ? { backgroundColor: activeColor, borderColor: activeColor }
            : styles.chipInactive,
        ]}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{children}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function PurposeSelector({
  purposeId,
  onSelect,
  autoDetected,
  autoDetectedEvent,
}: PurposeSelectorProps) {
  return (
    <View>
      {autoDetected ? (
        <View style={styles.banner}>
          <View style={styles.bannerTextArea}>
            <Text style={styles.bannerTitle}>캘린더에서 자동 감지됨</Text>
            {autoDetectedEvent ? (
              <Text style={styles.bannerSubtitle}>
                {autoDetectedEvent.time} · {autoDetectedEvent.title}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => onSelect(null)}
            style={styles.resetButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="자동 감지된 목적 해제"
          >
            <Text style={styles.resetButtonText}>해제</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        accessibilityRole="radiogroup"
        accessibilityLabel="오늘 외출 목적"
      >
        <Chip active={purposeId === null} activeColor={Colors.slate800} onPress={() => onSelect(null)} label="목적 없음">
          🔓 목적 없음
        </Chip>

        {PURPOSE_ORDER.map((id) => {
          const purpose = PURPOSES[id];
          const active = purposeId === id;
          const activeColor = PurposeColors[purpose.color].chip;
          return (
            <Chip key={id} active={active} activeColor={activeColor} onPress={() => onSelect(id)} label={purpose.label}>
              {purpose.emoji} {purpose.shortLabel}
            </Chip>
          );
        })}
      </ScrollView>

      {purposeId ? (
        <Text style={styles.clothingHint}>{PURPOSES[purposeId].clothingHint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.indigo50,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  bannerTextArea: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.indigo600,
  },
  bannerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.slate600,
  },
  resetButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 50,
    backgroundColor: Colors.white,
  },
  resetButtonText: {
    fontSize: 12,
    color: Colors.slate600,
    fontWeight: '500',
  },
  // 선택된 칩이 1.05배로 커질 때 가장자리가 잘리지 않게 여유를 둔다.
  scrollContent: {
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  clothingHint: {
    marginTop: 10,
    fontSize: 12,
    color: Colors.slate500,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.slate200,
  },
  chipInactive: {
    backgroundColor: Colors.white,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.slate600,
  },
  chipTextActive: {
    color: Colors.white,
  },
});
