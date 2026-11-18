import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Check, Plus, X } from 'lucide-react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { TimeInput } from './TimeInput';
import { Button } from './ui';
import { useAppStore } from '../store';
import { NotificationService } from '../services/notification/NotificationService';
import { describeDays, describeWhen, nextRing, type Alarm } from '../utils/alarms';
import { canUseFullScreenIntent, openFullScreenIntentSettings } from '../../modules/ahmatda-alarm';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
// 월요일부터 보여준다
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const LABEL_MAX = 20;

// 설정 > 알람. 휴대폰 알람처럼 끌 때까지 울리고, 요일 반복·5분 뒤 다시 울림이 된다.
// 끌 때 오늘 날씨와 챙길 것을 같이 보여준다 (AlarmOverlay).
export function AlarmSettings({ titleStyle, onMessage }: { titleStyle: object; onMessage: (text: string, undo?: () => void) => void }) {
  const styles = useStyles();
  const { Role } = useTheme();
  const alarms = useAppStore((s) => s.alarms);
  const addAlarm = useAppStore((s) => s.addAlarm);
  const removeAlarm = useAppStore((s) => s.removeAlarm);

  // 정확히 울리려면 두 권한이 필요하다 — 설정에서 바꾸고 돌아오면 다시 확인한다.
  const [exactOk, setExactOk] = useState(true);
  const [fullScreenOk, setFullScreenOk] = useState(true);
  const checkPermissions = useCallback(() => {
    NotificationService.isExactAlarmPermitted().then(setExactOk).catch(() => setExactOk(true));
    setFullScreenOk(canUseFullScreenIntent());
  }, []);
  useEffect(() => {
    checkPermissions();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && checkPermissions());
    return () => sub.remove();
  }, [checkPermissions]);

  const next = nextRing(alarms, new Date());

  const handleAdd = () => {
    addAlarm({ time: '07:00', days: [1, 2, 3, 4, 5], enabled: true, label: '기상' });
  };

  const handleRemove = (alarm: Alarm) => {
    const undo = removeAlarm(alarm.id);
    onMessage(`${alarm.time} 알람을 지웠어요.`, undo ?? undefined);
  };

  return (
    <View>
      <Text style={titleStyle}>알람</Text>
      <Text style={styles.help}>
        {next ? `다음 알람: ${describeWhen(next, new Date())}` : '휴대폰 알람처럼 끌 때까지 울려요. 끌 때 오늘 날씨와 챙길 것을 보여줘요.'}
      </Text>

      {alarms.length > 0 && !exactOk ? (
        <Warning
          text="'알람 및 리마인더' 권한이 꺼져 있어 제시간에 안 울릴 수 있어요."
          action="허용하기"
          onPress={() => NotificationService.openExactAlarmSettings()}
        />
      ) : null}
      {alarms.length > 0 && !fullScreenOk ? (
        <Warning
          text="'전체 화면 알림' 권한이 없어 잠금화면에 알람 화면 대신 알림만 떠요."
          action="허용하기"
          onPress={openFullScreenIntentSettings}
        />
      ) : null}

      {alarms.map((alarm) => (
        <AlarmRow key={alarm.id} alarm={alarm} onRemove={() => handleRemove(alarm)} />
      ))}

      <Button
        label="알람 추가"
        variant="soft"
        size="sm"
        icon={<Plus size={16} color={Role.actionText} />}
        onPress={handleAdd}
        style={styles.addButton}
      />
    </View>
  );
}

function Warning({ text, action, onPress }: { text: string; action: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.warning}>
      <Text style={styles.warningText}>{text}</Text>
      <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
        <Text style={styles.warningAction}>{action}</Text>
      </Pressable>
    </View>
  );
}

function AlarmRow({ alarm, onRemove }: { alarm: Alarm; onRemove: () => void }) {
  const styles = useStyles();
  const { Colors, Role } = useTheme();
  const updateAlarm = useAppStore((s) => s.updateAlarm);
  // 시각은 [완료]를 눌렀을 때만 반영한다 — 글자마다 다시 예약하지 않게.
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState(alarm.label);

  const toggleDay = (day: number) => {
    const days = alarm.days.includes(day) ? alarm.days.filter((d) => d !== day) : [...alarm.days, day];
    updateAlarm(alarm.id, { days, enabled: true });
  };

  return (
    <View style={[styles.card, !alarm.enabled && styles.cardOff]}>
      <View style={styles.cardTop}>
        {timeDraft !== null ? (
          <View style={styles.timeEdit}>
            <TimeInput value={timeDraft} onChange={setTimeDraft} compact autoFocus />
            <Pressable
              onPress={() => {
                updateAlarm(alarm.id, { time: timeDraft, enabled: true });
                setTimeDraft(null);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="알람 시각 저장"
            >
              <Check size={18} color={Role.doneText} />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setTimeDraft(alarm.time)} accessibilityRole="button" accessibilityLabel={`알람 ${alarm.time}, 눌러서 시각 변경`}>
            <Text style={[styles.time, !alarm.enabled && styles.textOff]}>{alarm.time}</Text>
          </Pressable>
        )}
        <View style={styles.cardTopRight}>
          <Switch
            value={alarm.enabled}
            onValueChange={(enabled) => updateAlarm(alarm.id, { enabled })}
            trackColor={{ false: Colors.slate200, true: Colors.indigo600 }}
            thumbColor={Colors.onColor}
            accessibilityLabel={`${alarm.time} 알람 켜기`}
          />
          <Pressable onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${alarm.time} 알람 지우기`}>
            <X size={18} color={Role.textMuted} />
          </Pressable>
        </View>
      </View>

      <TextInput
        style={styles.labelInput}
        value={labelDraft}
        onChangeText={(t) => setLabelDraft(t.slice(0, LABEL_MAX))}
        onEndEditing={() => labelDraft !== alarm.label && updateAlarm(alarm.id, { label: labelDraft.trim() })}
        placeholder="이름 (예: 기상, 약 먹기)"
        placeholderTextColor={Role.placeholder}
        maxLength={LABEL_MAX}
        accessibilityLabel="알람 이름"
      />

      <View style={styles.dayRow}>
        {DAY_ORDER.map((day) => {
          const active = alarm.days.includes(day);
          return (
            <Pressable
              key={day}
              style={[styles.dayChip, active && styles.dayChipActive]}
              onPress={() => toggleDay(day)}
              hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${DAY_LABELS[day]}요일`}
            >
              <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{DAY_LABELS[day]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.dayDesc}>
        {describeDays(alarm.days)}
        {alarm.days.length === 0 ? ' — 울리고 나면 꺼져요' : ' 반복'}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ Colors, Role }) => ({
  help: {
    marginBottom: Space.sm,
    fontSize: FontSize.caption,
    lineHeight: 17,
    color: Role.textMuted,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm,
    padding: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Role.warnSoft,
  },
  warningText: {
    flex: 1,
    fontSize: FontSize.caption,
    color: Role.warn,
  },
  warningAction: {
    fontSize: FontSize.label,
    fontWeight: '700',
    color: Role.actionText,
  },
  card: {
    marginBottom: Space.sm,
    padding: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Role.border,
    backgroundColor: Role.surface,
    gap: Space.sm,
  },
  cardOff: {
    opacity: 0.6,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  time: {
    fontSize: 32,
    fontWeight: '700',
    color: Role.text,
    fontVariant: ['tabular-nums'],
  },
  textOff: {
    color: Role.textMuted,
  },
  timeEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  labelInput: {
    paddingHorizontal: Space.md,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Role.surfaceSoft,
    fontSize: FontSize.label,
    color: Role.text,
  },
  dayRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayChip: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.slate100,
  },
  dayChipActive: {
    backgroundColor: Colors.indigo600,
  },
  dayChipText: {
    fontSize: FontSize.label,
    fontWeight: '600',
    color: Colors.slate500,
  },
  dayChipTextActive: {
    color: Colors.onColor,
  },
  dayDesc: {
    fontSize: FontSize.caption,
    color: Role.textMuted,
  },
  addButton: {
    alignSelf: 'flex-start',
    marginTop: Space.xs,
  },
}));
