import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { Button } from './ui';
import { TimeInput } from './TimeInput';
import { scheduleOf, useAppStore } from '../store';
import { holidayOn, weeklyPlanOn } from '../utils/schedule';
import { getTodayString, isValidHHmm } from '../utils/time';

type Choice = 'usual' | 'off' | 'time';

// 오늘만 바꾸기 — 대시보드 남은 시간 줄을 눌러 연다. 내일이면 저절로 원래 일정으로 돌아간다.
// 쉬는 날(오늘은 안 나가요)에는 출발 알림·외출 감지 알림만 쉬고 체크리스트는 그대로다.
export function TodayPlanSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { Role } = useTheme();
  const setTodayPlan = useAppStore((s) => s.setTodayPlan);
  const setDatePlans = useAppStore((s) => s.setDatePlans);
  const showToast = useAppStore((s) => s.showToast);

  // 원래 일정(요일 계획)과 지금 오늘 계획. 공휴일 대답·등록한 일정 같은 날짜별 계획도 '바꾼 것'으로 본다 —
  // [원래대로]가 그것까지 되돌려야 잘못 누른 [쉬어요]를 되돌릴 수 있다.
  const usual = useAppStore((s) => weeklyPlanOn(new Date(), scheduleOf(s)));
  const current = useAppStore((s) => {
    const sch = scheduleOf(s);
    const dated = sch.dates?.[getTodayString()];
    return sch.today?.plan ?? (dated === undefined || dated === 'usual' ? null : dated);
  });
  const todayHoliday = useAppStore((s) => holidayOn(new Date(), scheduleOf(s)));

  const [choice, setChoice] = useState<Choice>('usual');
  const [time, setTime] = useState('09:00');

  useEffect(() => {
    if (!visible) return;
    if (current === null) setChoice('usual');
    else if (current === 'off') setChoice('off');
    else {
      setChoice('time');
      setTime(current);
    }
    if (current === null || current === 'off') setTime(usual === 'off' ? '09:00' : usual);
  }, [visible, current, usual]);

  const handleSave = () => {
    if (choice === 'usual') {
      setTodayPlan(null);
      // 공휴일이면 "평소처럼"이라고 대답한 것으로 남긴다 (다시 묻지 않게).
      setDatePlans([getTodayString()], todayHoliday ? 'usual' : null);
      showToast('오늘은 원래 일정대로예요.');
    } else if (choice === 'off') {
      setTodayPlan('off');
      showToast('오늘은 외출 알림을 쉬어요. 내일부터 원래대로예요.');
    } else {
      if (!isValidHHmm(time)) {
        showToast('시간을 다시 확인해 주세요.');
        return;
      }
      setTodayPlan(time);
      showToast(`오늘만 ${time}에 나가요.`);
    }
    onClose();
  };

  const options: Array<{ value: Choice; label: string; sub: string }> = [
    { value: 'usual', label: '원래대로', sub: usual === 'off' ? '오늘은 쉬는 날' : `${usual} 출발` },
    { value: 'off', label: '오늘은 안 나가요', sub: '출발 알림·외출 감지 알림을 오늘만 쉬어요' },
    { value: 'time', label: '오늘만 다른 시간', sub: '내일부터는 원래 시간으로 돌아가요' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>오늘 외출</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기">
              <X size={20} color={Role.textMuted} />
            </Pressable>
          </View>

          {options.map((o) => {
            const selected = choice === o.value;
            return (
              <Pressable
                key={o.value}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => setChoice(o.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
              >
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{o.label}</Text>
                  <Text style={styles.optionSub}>{o.sub}</Text>
                </View>
                {selected ? <Check size={18} color={Role.actionText} /> : null}
              </Pressable>
            );
          })}

          {choice === 'time' ? (
            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>나가는 시간</Text>
              <TimeInput value={time} onChange={setTime} compact />
            </View>
          ) : null}

          <Button label="저장" onPress={handleSave} style={styles.save} />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ Role }) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    backgroundColor: Role.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.xl,
    paddingTop: 18,
    paddingBottom: 32,
    gap: Space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  title: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.text,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Role.border,
  },
  optionSelected: {
    borderColor: Role.action,
    backgroundColor: Role.actionSoft,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Role.textStrong,
  },
  optionLabelSelected: {
    color: Role.actionText,
  },
  optionSub: {
    marginTop: 2,
    fontSize: FontSize.caption,
    color: Role.textMuted,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
  },
  timeLabel: {
    fontSize: FontSize.body,
    color: Role.textStrong,
  },
  save: {
    marginTop: Space.sm,
  },
}));
