import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { FontSize, Space, makeStyles, useTheme } from '../../constants/theme';
import { scheduleOf, useAppStore } from '../../store';
import {
  answeredHolidayFrom, dayLabel, pendingHolidayQuestion, weeklyPlanOn, withIeyo, type DepartureSchedule,
} from '../../utils/schedule';
import { isValidHHmm } from '../../utils/time';
import { Button, Card } from '../../components/ui';
import { TimeInput } from '../../components/TimeInput';

// 공휴일 질문 — 오늘이나 내일이 대답 없는 공휴일이면 대시보드 맨 위에 묻는다 (2026-11-27 결정).
// 공휴일을 켜고 끄는 설정은 없다: 쉬는 날에도 다른 일정이 있을 수 있어 그날마다 묻는다.
// 대답이 없으면 평소처럼 나가는 날이다. [쉬어요]·[평소처럼]은 연휴 전체에, [다른 시간]은 첫날에만.
// 일정이 있으면 onAddEvent로 일정 등록 화면을 그 날짜로 연다.
export function HolidayQuestion({ now, onAddEvent }: { now: Date; onAddEvent?: (date: Date) => void }) {
  const styles = useStyles();
  const { Role } = useTheme();
  const scheduleJson = useAppStore((s) => JSON.stringify(scheduleOf(s)));
  const setDatePlans = useAppStore((s) => s.setDatePlans);
  const showToast = useAppStore((s) => s.showToast);
  const [picking, setPicking] = useState(false);
  const [time, setTime] = useState<string | null>(null);

  const schedule = JSON.parse(scheduleJson) as DepartureSchedule;
  const q = pendingHolidayQuestion(schedule, now);
  if (!q || q.dates.length === 0) {
    // 이미 대답했으면 한 줄로 보여주고 [바꾸기]로 대답을 지워 다시 묻는다 (잘못 누른 [쉬어요] 되돌리기).
    const a = answeredHolidayFrom(schedule, now);
    if (!a || a.dates.length === 0) return null;
    const summary = a.plan === 'off' ? '쉬어요' : a.plan === 'usual' ? '평소처럼 나가요' : `${a.plan}에 나가요`;
    return (
      <View style={styles.answered}>
        <CalendarDays size={16} color={Role.textMuted} />
        <Text style={styles.answeredText}>{dayLabel(a.first, now)} {a.name} · {summary}</Text>
        <Button label="바꾸기" size="sm" variant="text" onPress={() => setDatePlans(a.dates, null)} />
      </View>
    );
  }

  const day = dayLabel(q.first, now);
  const usual = weeklyPlanOn(q.first, schedule);
  const span = q.dates.length > 1 ? `${q.dates.length}일` : null;
  const pickedTime = time ?? (usual === 'off' ? '10:00' : usual);

  const answer = (plan: 'off' | 'usual') => {
    setDatePlans(q.dates, plan);
    setPicking(false);
    showToast(plan === 'off'
      ? `${q.name}에는 출발 알림·외출 감지 알림을 쉬어요.`
      : `${q.name}에도 평소처럼 알려 드릴게요.`);
  };

  const saveTime = () => {
    if (!isValidHHmm(pickedTime)) {
      showToast('시간을 다시 확인해 주세요.', null, 'warning');
      return;
    }
    setDatePlans([q.dates[0]], pickedTime);
    setPicking(false);
    setTime(null);
    showToast(`${day} ${pickedTime}에 나가요.`);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <CalendarDays size={18} color={Role.actionText} />
        <Text style={styles.title} accessibilityRole="header">
          {day}은 {withIeyo(q.name)}{span ? ` · ${span}` : ''}
        </Text>
      </View>
      <Text style={styles.sub}>평소처럼 나가세요? 대답이 없으면 평소처럼 알려 드려요.</Text>

      {picking ? (
        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>{day} 나가는 시간</Text>
          <TimeInput value={pickedTime} onChange={setTime} compact />
          <Button label="저장" size="sm" pill onPress={saveTime} />
        </View>
      ) : (
        <View style={styles.buttons}>
          <Button label="쉬어요" size="sm" pill variant="soft" onPress={() => answer('off')} />
          <Button label="평소처럼" size="sm" pill variant="soft" onPress={() => answer('usual')} />
          <Button label="다른 시간" size="sm" pill variant="neutral" onPress={() => setPicking(true)} />
          {onAddEvent ? (
            <Button label="일정 있어요" size="sm" pill variant="neutral" onPress={() => onAddEvent(q.first)} />
          ) : null}
        </View>
      )}
    </Card>
  );
}

const useStyles = makeStyles(({ Role }) => ({
  card: {
    marginBottom: Space.md,
    gap: Space.xs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  title: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Role.text,
  },
  sub: {
    fontSize: FontSize.caption,
    color: Role.textMuted,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  answered: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingLeft: Space.md,
    marginBottom: Space.sm,
  },
  answeredText: {
    flex: 1,
    fontSize: FontSize.label,
    color: Role.textMuted,
  },
  timeLabel: {
    fontSize: FontSize.label,
    color: Role.textStrong,
  },
}));
