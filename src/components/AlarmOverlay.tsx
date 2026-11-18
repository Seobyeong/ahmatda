import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { AlarmClock, CloudSun } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { useAppStore } from '../store';
import { AlarmService } from '../services/alarm/AlarmService';
import { buildWakeSummary } from '../utils/alarms';
import { setShowOverLock } from '../../modules/ahmatda-alarm';

// 알람이 울리는 동안 앱 맨 위에 덮는 화면. 잠금화면이면 알림의 전체 화면 동작으로 앱이 열리고
// 이 화면이 잠금화면 위에 뜬다. 끌 때 오늘 날씨와 챙길 것을 같이 보여준다 —
// 날씨는 아래 대시보드가 불러오는 대로 채워진다.
export function AlarmOverlay() {
  const styles = useStyles();
  const { Role } = useTheme();
  const insets = useSafeAreaInsets();
  const ringing = useAppStore((s) => s.ringingAlarm);
  const alarm = useAppStore((s) => s.alarms.find((a) => a.id === s.ringingAlarm?.alarmId));
  const weather = useAppStore((s) => s.currentWeather);
  const checklist = useAppStore((s) => s.checklist);
  const [now, setNow] = useState(() => new Date());
  const [snoozeFailed, setSnoozeFailed] = useState(false);

  const visible = ringing !== null;

  useEffect(() => {
    if (!visible) return;
    setShowOverLock(true);
    setSnoozeFailed(false);
    // 10초마다 시계를 넘기고, 알림이 이미 사라졌는지(10분 시간 초과·알림 쪽에서 끔) 본다 —
    // 사라졌으면 창을 닫아 잠금화면 위 표시와 화면 켜짐을 푼다.
    const timer = setInterval(() => {
      setNow(new Date());
      AlarmService.checkRinging().catch(() => {});
    }, 10_000);
    setNow(new Date());
    return () => {
      clearInterval(timer);
      setShowOverLock(false);
    };
  }, [visible]);

  if (!ringing) return null;

  const summary = buildWakeSummary(weather, checklist);
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <Modal visible animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + Space.xxl }]}>
        <View style={styles.top}>
          <AlarmClock size={28} color={Role.actionText} />
          <Text style={styles.clock} accessibilityRole="header">{hm}</Text>
          <Text style={styles.label}>{alarm?.label.trim() || '알람'}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <CloudSun size={18} color={Role.textSub} />
            <Text style={styles.cardTitle}>오늘</Text>
          </View>
          <Text style={styles.weather}>{summary.weather ?? '날씨를 불러오는 중이에요…'}</Text>
          {summary.weatherItems.length > 0 ? (
            <Text style={styles.weatherItems}>날씨 때문에 챙길 것: {summary.weatherItems.join(', ')}</Text>
          ) : null}
          <Text style={styles.items}>{summary.items}</Text>
        </View>

        <View style={styles.buttons}>
          {snoozeFailed ? (
            <Text style={styles.failText}>다시 울림을 예약하지 못했어요. 알람이 계속 울려요 — 끄려면 [끄기]를 눌러 주세요.</Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.snooze, pressed && styles.pressed]}
            onPress={async () => setSnoozeFailed(!(await AlarmService.snoozeAll()))}
            accessibilityRole="button"
            accessibilityLabel="5분 뒤 다시 울리기"
          >
            <Text style={styles.snoozeText}>5분 뒤 다시</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
            onPress={() => AlarmService.dismissAll()}
            accessibilityRole="button"
            accessibilityLabel="알람 끄기"
          >
            <Text style={styles.dismissText}>끄기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ Role }) => ({
  screen: {
    flex: 1,
    paddingHorizontal: Space.xxl,
    justifyContent: 'space-between',
    backgroundColor: Role.bg,
  },
  top: {
    alignItems: 'center',
    gap: Space.sm,
  },
  clock: {
    fontSize: 64,
    fontWeight: '700',
    color: Role.text,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: FontSize.title,
    color: Role.textSub,
  },
  card: {
    padding: Space.xl,
    borderRadius: Radius.xl,
    backgroundColor: Role.surface,
    gap: Space.sm,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  cardTitle: {
    fontSize: FontSize.label,
    fontWeight: '700',
    color: Role.textSub,
  },
  weather: {
    fontSize: FontSize.heading,
    fontWeight: '600',
    color: Role.text,
  },
  weatherItems: {
    fontSize: FontSize.body,
    color: Role.warn,
  },
  items: {
    fontSize: FontSize.body,
    color: Role.textStrong,
  },
  buttons: {
    gap: Space.md,
  },
  failText: {
    fontSize: FontSize.label,
    color: Role.danger,
    textAlign: 'center',
  },
  snooze: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: Role.actionSoft,
  },
  snoozeText: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.actionText,
  },
  dismiss: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: Role.action,
  },
  dismissText: {
    fontSize: FontSize.title,
    fontWeight: '700',
    color: Role.onAction,
  },
  pressed: {
    opacity: 0.8,
  },
}));
