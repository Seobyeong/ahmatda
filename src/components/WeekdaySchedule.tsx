import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { TimeInput } from './TimeInput';
import { useAppStore } from '../store';
import { describeSchedule, type DayPlan } from '../utils/schedule';
import { isValidHHmm } from '../utils/time';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Mode = 'base' | 'time' | 'off';

// 설정 > 요일별 외출 시간. 기본 시간과 다른 요일만 바꾼다 (기본 / 다른 시간 / 쉬는 날).
// 쉬는 날은 출발 알림·외출 감지 알림만 쉬고 체크리스트는 그대로다.
export function WeekdaySchedule() {
  const styles = useStyles();
  const base = useAppStore((s) => s.userSettings.departureTime);
  const weekdays = useAppStore((s) => s.userSettings.departureWeekdays);
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        style={styles.summaryRow}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`요일별 외출 시간, ${describeSchedule({ base, weekdays })}`}
      >
        <View style={styles.summaryText}>
          <Text style={styles.rowLabel}>요일별 외출 시간</Text>
          <Text style={styles.summary}>{describeSchedule({ base, weekdays })}</Text>
        </View>
        <Text style={styles.link}>{open ? '닫기' : '바꾸기'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.list}>
          {DAY_ORDER.map((day) => (
            <DayRow key={day} day={day} base={base} plan={weekdays[String(day)] ?? null} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function DayRow({ day, base, plan }: { day: number; base: string; plan: DayPlan | null }) {
  const styles = useStyles();
  const { Role } = useTheme();
  const setWeekdayPlan = useAppStore((s) => s.setWeekdayPlan);
  const mode: Mode = plan === null ? 'base' : plan === 'off' ? 'off' : 'time';
  // 다른 시간을 고르는 중일 때만 입력칸을 연다 — [완료]를 눌러야 저장 (글자마다 다시 예약하지 않게).
  const [draft, setDraft] = useState<string | null>(null);

  const choose = (m: Mode) => {
    if (m === 'base') {
      setDraft(null);
      setWeekdayPlan(day, null);
    } else if (m === 'off') {
      setDraft(null);
      setWeekdayPlan(day, 'off');
    } else {
      setDraft(mode === 'time' ? (plan as string) : base);
    }
  };

  const chips: Array<{ m: Mode; label: string }> = [
    { m: 'base', label: `기본 ${base}` },
    { m: 'time', label: mode === 'time' ? (plan as string) : '다른 시간' },
    { m: 'off', label: '쉼' },
  ];

  return (
    <View style={styles.dayRow}>
      <Text style={[styles.dayName, (day === 0 || day === 6) && styles.weekend]}>{DAY_NAMES[day]}</Text>
      {draft !== null ? (
        <View style={styles.editRow}>
          <TimeInput value={draft} onChange={setDraft} compact autoFocus />
          <Pressable
            onPress={() => {
              if (isValidHHmm(draft)) setWeekdayPlan(day, draft);
              setDraft(null);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${DAY_NAMES[day]}요일 시간 저장`}
          >
            <Check size={18} color={Role.doneText} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.chips}>
          {chips.map(({ m, label }) => {
            const selected = mode === m;
            return (
              <Pressable
                key={m}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => choose(m)}
                hitSlop={{ top: 6, bottom: 6 }}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${DAY_NAMES[day]}요일 ${label}`}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ Colors, Role }) => ({
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md,
    gap: Space.md,
  },
  summaryText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: FontSize.body,
    color: Role.text,
  },
  summary: {
    marginTop: 2,
    fontSize: FontSize.caption,
    color: Role.textMuted,
  },
  link: {
    fontSize: FontSize.label,
    fontWeight: '600',
    color: Role.actionText,
  },
  list: {
    gap: Space.sm,
    paddingBottom: Space.md,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: 40,
  },
  dayName: {
    width: 20,
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Role.textStrong,
  },
  weekend: {
    color: Role.danger,
  },
  chips: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: Space.md,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.slate100,
  },
  chipSelected: {
    backgroundColor: Colors.indigo600,
  },
  chipText: {
    fontSize: FontSize.label,
    fontWeight: '600',
    color: Colors.slate600,
  },
  chipTextSelected: {
    color: Colors.onColor,
  },
  editRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
}));
