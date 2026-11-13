import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../../constants/theme';
import { useAppStore } from '../../store';
import { getDepartureCountdown } from '../../utils/time';

function createPulse(scale: Animated.Value, opacity: Animated.Value) {
  return Animated.loop(
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.8, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
      Animated.delay(600),
      Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
    ])
  );
}

function PulseDot({ color }: { color: string }) {
  const styles = useStyles();
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    // 기기에서 "동작 줄이기"를 켠 사람에게는 계속 깜빡이는 점을 멈춘다.
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled || reduce) return;
        loop = createPulse(scale, opacity);
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [scale, opacity]);

  return (
    <View style={styles.pulseWrapper}>
      <View style={[styles.pulseDotCore, { backgroundColor: color }]} />
      <Animated.View
        style={[styles.pulseDotRing, { backgroundColor: color, opacity, transform: [{ scale }] }]}
      />
    </View>
  );
}

// 외출까지 남은 시간 — 한 줄. 닫으면 그날은 다시 나오지 않는다.
export function StatusRow({ now }: { now: Date }) {
  const { Colors, Role } = useTheme();
  const styles = useStyles();
  const departureTime = useAppStore((s) => s.userSettings.departureTime);
  const statusDismissed = useAppStore((s) => s.statusDismissed);
  const dismissStatus = useAppStore((s) => s.dismissStatus);

  if (statusDismissed) return null;
  const countdown = getDepartureCountdown(departureTime, now);

  return (
    <View style={[styles.statusRow, countdown.soon && styles.statusRowSoon]}>
      <View
        style={styles.statusLeft}
        accessible
        accessibilityLabel={[countdown.label, countdown.value, countdown.detail].filter(Boolean).join(', ')}
      >
        <PulseDot color={countdown.soon ? Colors.amber500 : Colors.emerald500} />
        <Text style={[styles.statusLabel, countdown.soon && styles.statusLabelSoon]}>{countdown.label}</Text>
        <Text style={styles.statusTime}>{countdown.value}</Text>
        {countdown.detail ? <Text style={styles.statusDetail}>{countdown.detail}</Text> : null}
      </View>
      <Pressable
        style={styles.iconButton}
        onPress={dismissStatus}
        accessibilityRole="button"
        accessibilityLabel="외출 시간 안내 닫기"
      >
        <X size={18} color={Role.textMuted} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ Role }) => ({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingLeft: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.md,
  },
  statusRowSoon: {
    backgroundColor: Role.warnSoft,
  },
  statusLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: Space.sm,
  },
  statusLabel: {
    fontSize: FontSize.label,
    color: Role.textMuted,
  },
  statusLabelSoon: {
    color: Role.warn,
    fontWeight: '700',
  },
  statusTime: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.text,
  },
  statusDetail: {
    fontSize: FontSize.label,
    color: Role.textMuted,
  },
  // 아이콘만 있는 버튼의 공통 터치 영역 (44×44)
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseWrapper: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  pulseDotCore: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pulseDotRing: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
}));
