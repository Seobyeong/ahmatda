import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View,
} from 'react-native';
import { Check, Plus, X } from 'lucide-react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { PURPOSES, PURPOSE_ORDER, matchPurposeByTitle, purposeItemKey } from '../constants/purposes';
import { scheduleOf, useAppStore } from '../store';
import { CalendarService, type WritableCalendar } from '../services/calendar/CalendarService';
import { holidayOn } from '../utils/schedule';
import { isValidHHmm, toDateString } from '../utils/time';
import { Button } from './ui';
import { PurposeIcon } from './PurposeIcon';
import { TimeInput } from './TimeInput';
import type { PurposeId } from '../types';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const DATE_CHOICES = 21;            // 오늘부터 3주
const EVENT_LENGTH_MS = 60 * 60 * 1000;
const DEFAULT_LEAD_MIN = 60;        // 나가는 시간 기본값 = 일정 1시간 전

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function minusMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.max(0, h * 60 + m - minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function at(dateKey: string, hhmm: string): Date {
  const d = fromDateKey(dateKey);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
}

interface AddEventSheetProps {
  visible: boolean;
  onClose: () => void;
  initialDate?: Date | null;
  // 저장한 뒤 — 오늘 일정이면 대시보드가 일정을 다시 읽어 목적을 맞춘다.
  onSaved?: (date: string) => void;
}

// 일정 등록 — 기기 캘린더에 일정을 넣고, 그 일정의 목적(카테고리)과 그날 챙길 것·나가는 시간을 미리 정한다.
// (2026-11-27 결정: 캘린더는 처음 등록할 때 고르고 기억, 나가는 시간 기본 = 일정 1시간 전)
// 일정 제목·장소는 캘린더에만 들어가고 앱에는 일정 id와 고른 목적만 남는다.
export function AddEventSheet({ visible, onClose, initialDate, onSaved }: AddEventSheetProps) {
  const styles = useStyles();
  const { Role } = useTheme();
  const userSettings = useAppStore((s) => s.userSettings);
  const eventCalendar = useAppStore((s) => s.eventCalendar);
  const setEventCalendar = useAppStore((s) => s.setEventCalendar);
  const registerEvent = useAppStore((s) => s.registerEvent);
  const showToast = useAppStore((s) => s.showToast);
  const scheduleJson = useAppStore((s) => JSON.stringify(scheduleOf(s)));

  const [title, setTitle] = useState('');
  const [dateKey, setDateKey] = useState(() => toDateString(new Date()));
  const [start, setStart] = useState('10:00');
  const [location, setLocation] = useState('');
  const [purpose, setPurpose] = useState<PurposeId | null>(null);
  const [purposeTouched, setPurposeTouched] = useState(false);
  const [setsDeparture, setSetsDeparture] = useState(true);
  const [departure, setDeparture] = useState<string | null>(null); // null = 일정 1시간 전 따라감
  const [extras, setExtras] = useState<string[]>([]);
  const [itemDraft, setItemDraft] = useState('');
  const [calendars, setCalendars] = useState<WritableCalendar[] | null>(null); // 고르는 단계일 때만
  const [saving, setSaving] = useState(false);
  // 실패 이유는 시트 안에 보여 준다 — 토스트는 이 모달 뒤 화면에 그려져 보이지 않는다.
  const [error, setError] = useState<{ text: string; openSettings?: boolean } | null>(null);

  // 열 때마다 새로 — 공휴일 질문에서 열면 그 날짜로.
  useEffect(() => {
    if (!visible) return;
    setTitle('');
    const now = new Date();
    const day = initialDate ?? now;
    setDateKey(toDateString(day));
    // 오늘이면 다음 정각 한 시간 뒤(늦은 밤이면 23:00), 다른 날이면 10:00에서 시작한다.
    const isToday = toDateString(day) === toDateString(now);
    setStart(isToday ? `${String(Math.min(now.getHours() + 2, 23)).padStart(2, '0')}:00` : '10:00');
    setLocation('');
    setPurpose(null);
    setPurposeTouched(false);
    setSetsDeparture(true);
    setDeparture(null);
    setExtras([]);
    setItemDraft('');
    setCalendars(null);
    setSaving(false);
    setError(null);
  }, [visible, initialDate]);

  // 제목으로 목적 추측 — 사용자가 직접 고르기 전까지만.
  useEffect(() => {
    if (purposeTouched) return;
    setPurpose(title.trim() ? matchPurposeByTitle(title, userSettings.customKeywords) : null);
  }, [title, purposeTouched, userSettings.customKeywords]);

  const schedule = useMemo(() => JSON.parse(scheduleJson), [scheduleJson]);
  // 열 때의 오늘 — 열어 둔 채 자정을 넘겨도 칩이 흔들리지 않게.
  const today = useMemo(() => new Date(), [visible]);
  const dateChoices = useMemo(
    () => Array.from({ length: DATE_CHOICES }, (_, i) => addDays(today, i)),
    [today]
  );
  const leaveAt = departure ?? (isValidHHmm(start) ? minusMinutes(start, DEFAULT_LEAD_MIN) : '09:00');
  const purposeItems = purpose
    ? PURPOSES[purpose].items.filter((i) => !userSettings.disabledPurposeItems.includes(purposeItemKey(purpose, i.label)))
    : [];

  const addExtra = () => {
    const label = itemDraft.trim();
    if (!label) return;
    if (!extras.includes(label) && !purposeItems.some((i) => i.label === label)) setExtras([...extras, label]);
    setItemDraft('');
  };

  const save = async (calendarId?: string) => {
    if (saving) return;
    setError(null);
    if (!title.trim()) { setError({ text: '일정 이름을 적어 주세요.' }); return; }
    if (!isValidHHmm(start)) { setError({ text: '일정 시간을 다시 확인해 주세요.' }); return; }
    if (at(dateKey, start).getTime() <= Date.now()) { setError({ text: '이미 지난 시간이에요. 날짜나 시간을 바꿔 주세요.' }); return; }
    if (setsDeparture && !isValidHHmm(leaveAt)) { setError({ text: '나가는 시간을 다시 확인해 주세요.' }); return; }
    if (setsDeparture && leaveAt > start) { setError({ text: '나가는 시간이 일정보다 늦어요.' }); return; }

    setSaving(true);
    try {
      if (!(await CalendarService.requestWritePermission())) {
        setError({ text: '캘린더 권한이 필요해요. 설정에서 캘린더를 허용해 주세요.', openSettings: true });
        return;
      }
      // 넣을 캘린더 — 고른 게 없거나 사라졌으면 고르게 한다 (하나뿐이면 그대로).
      const list = await CalendarService.writableCalendars();
      let target = list.find((c) => c.id === (calendarId ?? eventCalendar?.id));
      if (!target) {
        if (list.length === 0) { setError({ text: '일정을 넣을 수 있는 캘린더가 없어요.' }); return; }
        if (list.length > 1) { setCalendars(list); return; }
        target = list[0];
      }
      setEventCalendar({ id: target.id, title: target.title });

      const startAt = at(dateKey, start);
      const eventId = await CalendarService.addEvent({
        calendarId: target.id,
        title: title.trim(),
        start: startAt,
        end: new Date(startAt.getTime() + EVENT_LENGTH_MS),
        location: location.trim() || undefined,
      });
      registerEvent({
        eventId,
        date: dateKey,
        purposeId: purpose,
        departureTime: setsDeparture ? leaveAt : null,
        items: extras,
      });
      const d = fromDateKey(dateKey);
      showToast(`${d.getMonth() + 1}/${d.getDate()} ${start} '${title.trim()}' 일정을 넣었어요.`);
      onSaved?.(dateKey);
      onClose();
    } catch {
      setError({ text: '일정을 넣지 못했어요. 다시 시도해 주세요.' });
    } finally {
      setSaving(false);
    }
  };

  const dayChipLabel = (d: Date, i: number) =>
    i === 0 ? '오늘' : i === 1 ? '내일' : `${d.getMonth() + 1}/${d.getDate()} ${DAY_NAMES[d.getDay()]}`;
  const holiday = holidayOn(fromDateKey(dateKey), schedule);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {calendars ? '어느 캘린더에 넣을까요?' : '일정 추가'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기">
              <X size={20} color={Role.textMuted} />
            </Pressable>
          </View>

          {calendars ? (
            <ScrollView contentContainerStyle={styles.body}>
              <Text style={styles.hint}>한 번 고르면 다음부터 여기에 넣어요. 설정에서 바꿀 수 있어요.</Text>
              {calendars.map((c) => (
                <Pressable
                  key={c.id}
                  style={styles.calendarRow}
                  onPress={() => { setCalendars(null); save(c.id); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.title}, ${c.account}`}
                >
                  <View style={[styles.calendarDot, { backgroundColor: c.color || Role.action }]} />
                  <View style={styles.flex}>
                    <Text style={styles.calendarTitle}>{c.title}</Text>
                    <Text style={styles.hint}>{c.account}{c.isPrimary ? ' · 기본' : ''}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="일정 이름 (예: 친구 약속, 헬스)"
                placeholderTextColor={Role.placeholder}
                maxLength={60}
                accessibilityLabel="일정 이름"
              />

              <Text style={styles.label}>날짜</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {dateChoices.map((d, i) => {
                  const key = toDateString(d);
                  const selected = key === dateKey;
                  const isHoliday = !!holidayOn(d, schedule);
                  return (
                    <Pressable
                      key={key}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setDateKey(key)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected, isHoliday && !selected && styles.chipHoliday]}>
                        {dayChipLabel(d, i)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {holiday ? <Text style={styles.hint}>{holiday}</Text> : null}

              <View style={styles.row}>
                <Text style={styles.label}>시간</Text>
                <TimeInput value={start} onChange={setStart} compact />
              </View>

              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder="장소 (선택)"
                placeholderTextColor={Role.placeholder}
                maxLength={80}
                accessibilityLabel="장소"
              />

              <Text style={styles.label}>어떤 외출이에요?</Text>
              <View style={styles.wrap}>
                {PURPOSE_ORDER.map((id) => {
                  const selected = purpose === id;
                  return (
                    <Pressable
                      key={id}
                      style={[styles.chip, styles.purposeChip, selected && styles.chipSelected]}
                      onPress={() => { setPurposeTouched(true); setPurpose(selected ? null : id); }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                    >
                      <PurposeIcon id={id} size={14} color={selected ? Role.actionText : Role.textMuted} />
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{PURPOSES[id].shortLabel}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.hint}>
                {purpose
                  ? purposeTouched ? '그날 이 준비물이 체크리스트에 들어가요.' : '이름을 보고 골랐어요. 다르면 바꿔 주세요.'
                  : '고르지 않으면 평소 체크리스트만 떠요.'}
              </Text>

              <Text style={styles.label}>그날 챙길 것</Text>
              {purposeItems.map((i) => (
                <View key={i.label} style={styles.itemRow}>
                  <Check size={14} color={Role.textMuted} />
                  <Text style={styles.itemText}>{i.label}</Text>
                  <Text style={styles.hint}>{PURPOSES[purpose!].shortLabel} 준비물</Text>
                </View>
              ))}
              {extras.map((label) => (
                <View key={label} style={styles.itemRow}>
                  <Check size={14} color={Role.actionText} />
                  <Text style={styles.itemText}>{label}</Text>
                  <Pressable
                    onPress={() => setExtras(extras.filter((e) => e !== label))}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} 빼기`}
                  >
                    <X size={16} color={Role.textMuted} />
                  </Pressable>
                </View>
              ))}
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={itemDraft}
                  onChangeText={setItemDraft}
                  onSubmitEditing={addExtra}
                  placeholder="이 날만 챙길 것 추가"
                  placeholderTextColor={Role.placeholder}
                  returnKeyType="done"
                  maxLength={30}
                  accessibilityLabel="이 날만 챙길 것"
                />
                <Pressable style={styles.addButton} onPress={addExtra} accessibilityRole="button" accessibilityLabel="추가">
                  <Plus size={18} color={Role.actionText} />
                </Pressable>
              </View>

              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.label}>이 날 외출 시간으로 쓰기</Text>
                  <Text style={styles.hint}>출발 알림·외출 감지가 이 시간에 맞춰져요. 쉬는 날이어도요.</Text>
                </View>
                <Switch value={setsDeparture} onValueChange={setSetsDeparture} accessibilityLabel="이 날 외출 시간으로 쓰기" />
              </View>
              {setsDeparture ? (
                <View style={styles.row}>
                  <Text style={styles.label}>나가는 시간</Text>
                  <TimeInput value={leaveAt} onChange={setDeparture} compact />
                </View>
              ) : null}

              {error ? (
                <View style={styles.errorRow} accessibilityLiveRegion="polite">
                  <Text style={styles.errorText}>{error.text}</Text>
                  {error.openSettings ? (
                    <Button label="설정 열기" size="sm" variant="text" onPress={() => { Linking.openSettings(); }} />
                  ) : null}
                </View>
              ) : null}
              <Button label={saving ? '넣는 중…' : '캘린더에 넣기'} onPress={() => save()} disabled={saving} style={styles.save} />
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '92%',
    backgroundColor: Role.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.xl,
    marginBottom: Space.sm,
  },
  title: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.text,
  },
  body: {
    paddingHorizontal: Space.xl,
    paddingBottom: 32,
    gap: Space.sm,
  },
  label: {
    marginTop: Space.xs,
    fontSize: FontSize.label,
    fontWeight: '600',
    color: Role.textStrong,
  },
  hint: {
    fontSize: FontSize.caption,
    color: Role.textMuted,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Role.surfaceSoft,
    fontSize: FontSize.body,
    color: Role.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  flex: {
    flex: 1,
  },
  chips: {
    gap: Space.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Role.border,
    justifyContent: 'center',
  },
  purposeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  chipSelected: {
    borderColor: Role.action,
    backgroundColor: Role.actionSoft,
  },
  chipText: {
    fontSize: FontSize.label,
    color: Role.textStrong,
  },
  chipTextSelected: {
    color: Role.actionText,
    fontWeight: '700',
  },
  chipHoliday: {
    color: Role.danger,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: 32,
  },
  itemText: {
    flex: 1,
    fontSize: FontSize.body,
    color: Role.text,
  },
  addButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Role.actionSoft,
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: 56,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Role.border,
  },
  calendarDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  calendarTitle: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Role.text,
  },
  save: {
    marginTop: Space.md,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.label,
    color: Role.danger,
  },
}));
