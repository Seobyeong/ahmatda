import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { CalendarCheck } from 'lucide-react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { PURPOSES, PURPOSE_ORDER } from '../constants/purposes';
import { PurposeIcon } from './PurposeIcon';
import { Button } from './ui';
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
  label: string; // 화면 낭독기용 전체 이름
  text: string;
  icon?: (color: string) => React.ReactNode;
  /** 고른 칩의 글자·아이콘 색 (기본: 색 있는 면 위의 흰색) */
  activeTextColor?: string;
  hint?: string;
}

function Chip({ active, activeColor, onPress, label, text, icon, activeTextColor, hint }: ChipProps) {
  const { Colors } = useTheme();
  const styles = useStyles();
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
        accessibilityHint={hint}
        style={[
          styles.chip,
          active
            ? { backgroundColor: activeColor, borderColor: activeColor }
            : styles.chipInactive,
        ]}
      >
        {/* 고르지 않은 칩도 아이콘은 목적 색으로 둔다 — 색만 보고도 어느 목적인지 익힌다. */}
        {icon ? icon(active ? activeTextColor ?? Colors.onColor : activeColor) : null}
        <Text style={[styles.chipText, active && styles.chipTextActive, active && activeTextColor ? { color: activeTextColor } : null]}>
          {text}
        </Text>
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
  const { Role, PurposeColors } = useTheme();
  const styles = useStyles();
  const [viewWidth, setViewWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const moreRight = contentWidth - viewWidth - scrollX > 4;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setScrollX(e.nativeEvent.contentOffset.x);
  return (
    <View>
      {autoDetected ? (
        <View style={styles.banner}>
          <CalendarCheck size={16} color={Role.textMuted} />
          <View style={styles.bannerTextArea}>
            <Text style={styles.bannerTitle}>캘린더 일정으로 목적을 골랐어요</Text>
            {autoDetectedEvent ? (
              <Text style={styles.bannerSubtitle} numberOfLines={1}>
                {autoDetectedEvent.time} · {autoDetectedEvent.title}
              </Text>
            ) : null}
          </View>
          <Button
            label="해제"
            variant="text"
            size="sm"
            onPress={() => onSelect(null)}
            accessibilityLabel="자동 감지된 목적 해제"
          />
        </View>
      ) : null}

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          accessibilityRole="radiogroup"
          accessibilityLabel="오늘 외출 목적"
          onLayout={(e) => setViewWidth(e.nativeEvent.layout.width)}
          onContentSizeChange={(w) => setContentWidth(w)}
          onScroll={onScroll}
          scrollEventThrottle={32}
        >
          {/* '목적 없음' 칩은 없앴다 — 고른 칩을 다시 누르면 풀린다. 칩 하나가 줄어 '공부'까지 한 화면에 들어온다. */}
          {PURPOSE_ORDER.map((id) => {
            const purpose = PURPOSES[id];
            const active = purposeId === id;
            return (
              <Chip
                key={id}
                active={active}
                activeColor={PurposeColors[purpose.color].chip}
                onPress={() => onSelect(active ? null : id)}
                label={purpose.label}
                text={purpose.shortLabel}
                hint={active ? '다시 누르면 목적을 풀어요' : undefined}
                icon={(color) => <PurposeIcon id={id} color={color} />}
              />
            );
          })}
        </ScrollView>
        {/* 오른쪽에 칩이 더 있으면 끝을 흐리게 — 넘길 수 있다는 표시 */}
        {moreRight ? (
          <View style={styles.fade} pointerEvents="none">
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id="purposeFade" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={Role.bg} stopOpacity="0" />
                  <Stop offset="1" stopColor={Role.bg} stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#purposeFade)" />
            </Svg>
          </View>
        ) : null}
      </View>

      {purposeId ? (
        <Text style={styles.clothingHint}>{PURPOSES[purposeId].clothingHint}</Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ Colors, Role, Shadow }) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: Role.surfaceSoft,
    borderRadius: Radius.md,
    paddingVertical: Space.sm,
    paddingHorizontal: 14,
    marginBottom: Space.sm,
  },
  bannerTextArea: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: FontSize.label,
    fontWeight: '600',
    color: Role.textStrong,
  },
  bannerSubtitle: {
    marginTop: 2,
    fontSize: FontSize.caption,
    color: Role.textSub,
  },
  // 선택된 칩이 1.05배로 커질 때 가장자리가 잘리지 않게 여유를 둔다.
  scrollContent: {
    gap: Space.sm,
    paddingVertical: Space.xs,
    paddingHorizontal: 2,
  },
  fade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 32,
  },
  clothingHint: {
    marginTop: Space.sm,
    fontSize: FontSize.caption,
    color: Role.textMuted,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Role.border,
  },
  chipInactive: {
    backgroundColor: Role.surface,
  },
  chipText: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Role.textSub,
  },
  chipTextActive: {
    color: Colors.onColor,
  },
}));
