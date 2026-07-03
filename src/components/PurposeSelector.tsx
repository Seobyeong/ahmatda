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
  children: React.ReactNode;
}

function Chip({ active, activeColor, onPress, children }: ChipProps) {
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
          <Pressable onPress={() => onSelect(null)} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>초기화</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Chip active={purposeId === null} activeColor={Colors.slate800} onPress={() => onSelect(null)}>
          🔓 목적 없음
        </Chip>

        {PURPOSE_ORDER.map((id) => {
          const purpose = PURPOSES[id];
          const active = purposeId === id;
          const activeColor = PurposeColors[purpose.color].chip;
          return (
            <Chip key={id} active={active} activeColor={activeColor} onPress={() => onSelect(id)}>
              {purpose.emoji} {purpose.shortLabel}
            </Chip>
          );
        })}
      </ScrollView>
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
  scrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.slate200,
  },
  chipInactive: {
    backgroundColor: Colors.white,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.slate500,
  },
  chipTextActive: {
    color: Colors.white,
  },
});
