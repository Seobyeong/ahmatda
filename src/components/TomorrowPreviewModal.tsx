import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { PURPOSES } from '../constants/purposes';
import { useAppStore } from '../store';
import type { DayOutlook } from '../services/weather/forecastDate';
import { fetchPreviewInputs } from '../services/nightly/previewInputs';
import { countRecentForgotten } from '../utils/forgotten';
import { buildTomorrowPreview } from '../utils/tomorrowPreview';
import { getNextDepartureDate, getTodayString, toDateString } from '../utils/time';
import type { CalendarEvent } from '../types';

interface TomorrowPreviewModalProps {
  visible: boolean;
  onClose: () => void;
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// 자기 전 정리 — 다음 외출 날 체크리스트 미리보기 (docs/외출-감지-재설계.md 5장).
// 그날 요일·일정·예보로 무엇이 뜰지 보여주고, 그날만 챙길 것을 바로 더할 수 있다.
// 일정은 화면에만 들고 있다가 닫으면 버린다 (일정은 기기에 저장하지 않는다 — 개인정보처리방침).
export function TomorrowPreviewModal({ visible, onClose }: TomorrowPreviewModalProps) {
  const userSettings = useAppStore((s) => s.userSettings);
  const permanentRoutines = useAppStore((s) => s.permanentRoutines);
  const forgottenHistory = useAppStore((s) => s.forgottenHistory);
  const addOneOffItem = useAppStore((s) => s.addOneOffItem);
  const removePermanentRoutine = useAppStore((s) => s.removePermanentRoutine);

  const [target, setTarget] = useState(() => getNextDepartureDate(userSettings.departureTime));
  // "오늘/내일"은 연 순간 기준으로 고정한다 — 열어둔 채 자정을 넘기면 제목만 바뀌고
  // 일정·예보는 연 시점 것이라 서로 어긋난다.
  const [isToday, setIsToday] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [outlook, setOutlook] = useState<DayOutlook | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');

  // 열 때마다 대상 날짜를 다시 정한다 — 22:00에 열면 내일, 00:30에 열면 달력상 오늘.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    const next = getNextDepartureDate(userSettings.departureTime);
    setTarget(next);
    setIsToday(toDateString(next) === getTodayString());
    setLoading(true);

    // 자기 전 정리 알림의 "다음 외출: …"과 같은 데이터 (services/nightly/previewInputs)
    (async () => {
      try {
        const inputs = await fetchPreviewInputs(next, userSettings.departureTime);
        if (cancelled) return;
        setEvents(inputs.events);
        setOutlook(inputs.outlook);
      } catch {
        // 각 서비스가 실패를 빈 값으로 돌려주지만, 예상 밖 예외에도 로딩이 멈추지 않게.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, userSettings.departureTime]);

  const targetDate = toDateString(target);
  const preview = useMemo(
    () =>
      buildTomorrowPreview({
        date: target,
        departureTime: userSettings.departureTime,
        routines: permanentRoutines,
        events,
        customKeywords: userSettings.customKeywords,
        disabledWeatherItems: userSettings.disabledWeatherItems,
        disabledPurposeItems: userSettings.disabledPurposeItems,
        outlook,
        forgottenCounts: countRecentForgotten(forgottenHistory, getTodayString()),
        commuteMode: userSettings.commuteMode,
      }),
    [target, userSettings, permanentRoutines, events, outlook, forgottenHistory]
  );

  const handleClose = () => {
    setDraft('');
    setMessage(null);
    setEvents([]);
    setOutlook(null);
    onClose();
  };

  const handleAdd = () => {
    const label = draft.trim();
    if (!label) return;
    // 이미 뜨는 항목을 또 더하면 아침 체크리스트에서는 어차피 한 줄로 합쳐진다.
    if (preview.items.some((i) => i.label === label)) {
      setMessage(`'${label}'은(는) 이미 목록에 있어요.`);
      return;
    }
    addOneOffItem(label, targetDate);
    setDraft('');
    setMessage(null);
  };
  const heading = `${isToday ? '오늘' : '내일'} ${target.getMonth() + 1}/${target.getDate()}(${DAY_LABELS[target.getDay()]}) ${userSettings.departureTime} 출발`;

  let weatherLine: string;
  if (loading) weatherLine = '예보를 불러오는 중...';
  else if (!outlook) weatherLine = '예보를 불러오지 못했어요. 날씨 항목은 아침에 다시 맞춰요.';
  else {
    const range = outlook.minTemp !== null && outlook.maxTemp !== null ? `${outlook.minTemp}~${outlook.maxTemp}°C · ` : '';
    weatherLine = `${range}강수확률 최대 ${outlook.popMax}%`;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>다음 외출 준비</Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <X size={20} color={Colors.slate500} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>{heading}</Text>
            <View style={styles.weatherRow}>
              {loading ? <ActivityIndicator size="small" color={Colors.slate400} /> : null}
              <Text style={styles.weatherText}>{weatherLine}</Text>
            </View>
            {preview.purposeId ? (
              <Text style={styles.purposeText}>
                {PURPOSES[preview.purposeId].emoji} 일정으로 보면 {PURPOSES[preview.purposeId].shortLabel} 준비가 필요해요
              </Text>
            ) : null}

            {preview.items.length === 0 ? (
              <Text style={styles.empty}>챙길 것이 없어요.</Text>
            ) : (
              preview.items.map((item) => (
                <View key={`${item.kind}-${item.label}`} style={styles.itemRow}>
                  <View style={styles.itemTextBox}>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    {item.reason ? <Text style={styles.itemReason}>{item.reason}</Text> : null}
                  </View>
                  {item.routineId ? (
                    <Pressable
                      onPress={() => removePermanentRoutine(item.routineId!)}
                      hitSlop={8}
                      accessibilityLabel={`${item.label} 삭제`}
                    >
                      <X size={16} color={Colors.slate400} />
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}

            <View style={styles.addRow}>
              <TextInput
                style={styles.addInput}
                value={draft}
                onChangeText={setDraft}
                placeholder="이 날만 챙길 것 추가..."
                placeholderTextColor={Colors.slate400}
                onSubmitEditing={handleAdd}
                returnKeyType="done"
                submitBehavior="submit"
              />
              <Pressable
                style={[styles.addButton, !draft.trim() && styles.buttonDisabled]}
                onPress={handleAdd}
                disabled={!draft.trim()}
              >
                <Text style={styles.addButtonText}>추가</Text>
              </Pressable>
            </View>

            {message ? <Text style={styles.message}>{message}</Text> : null}

            <Text style={styles.note}>
              아침에는 그때 날씨와 일정으로 다시 맞춰요. 추가한 항목은 그날 체크리스트에 나타나요.
            </Text>

            <Pressable style={styles.primaryButton} onPress={handleClose}>
              <Text style={styles.primaryText}>확인했어요</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.slate800,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  heading: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.slate700,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  weatherText: {
    fontSize: 12,
    color: Colors.slate500,
  },
  purposeText: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.indigo600,
  },
  empty: {
    marginTop: 16,
    fontSize: 13,
    color: Colors.slate500,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate100,
  },
  itemTextBox: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 14,
    color: Colors.slate800,
  },
  itemReason: {
    marginTop: 2,
    fontSize: 11,
    color: Colors.slate500,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  addInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.slate50,
    fontSize: 13,
    color: Colors.slate800,
  },
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.indigo600,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  message: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.slate600,
  },
  note: {
    marginTop: 12,
    fontSize: 11,
    lineHeight: 16,
    color: Colors.slate400,
  },
  primaryButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.indigo600,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
});
