import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { PURPOSES } from '../constants/purposes';
import { SENSITIVITY_DELTA } from '../constants/feedback';
import { useAppStore } from '../store';
import { CalendarService } from '../services/calendar/CalendarService';
import { WifiMonitorService } from '../services/wifi/WifiMonitorService';
import { SensitivitySelector } from './SensitivitySelector';
import { TimeInput } from './TimeInput';
import type { FeedbackType } from '../types';

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
}

const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  cold: '추웠음',
  good: '적당함',
  hot: '더웠음',
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// tier1 날씨 트리거 항목 — buildChecklist()에서 생성하는 라벨과 반드시 일치해야 한다.
const WEATHER_ITEMS: { label: string; description: string }[] = [
  { label: '우산', description: '비 예보 시 표시' },
  { label: '마스크', description: '미세먼지 나쁨일 때 표시' },
  { label: '물병', description: '폭염 주의보일 때 표시' },
];

export function SettingsPanel({ visible, onClose }: SettingsPanelProps) {
  const translateY = useRef(new Animated.Value(visible ? 0 : -300)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : -300,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible, translateY]);

  const departureTime = useAppStore((s) => s.userSettings.departureTime);
  const deltaOffset = useAppStore((s) => s.userSettings.deltaOffset);
  const sensitivityLevel = useAppStore((s) => s.userSettings.sensitivityLevel);
  const homeBssid = useAppStore((s) => s.userSettings.homeBssid);
  const disabledWeatherItems = useAppStore((s) => s.userSettings.disabledWeatherItems);
  const disabledPurposeItems = useAppStore((s) => s.userSettings.disabledPurposeItems);
  const customKeywords = useAppStore((s) => s.userSettings.customKeywords);
  const purposeId = useAppStore((s) => s.purposeId);
  const permanentRoutines = useAppStore((s) => s.permanentRoutines);
  const feedbackHistory = useAppStore((s) => s.feedbackHistory);
  const updateDepartureTime = useAppStore((s) => s.updateDepartureTime);
  const setSensitivity = useAppStore((s) => s.setSensitivity);
  const updateDeltaOffset = useAppStore((s) => s.updateDeltaOffset);
  const setHomeBssid = useAppStore((s) => s.setHomeBssid);
  const removePermanentRoutine = useAppStore((s) => s.removePermanentRoutine);
  const setRoutineDays = useAppStore((s) => s.setRoutineDays);
  const setWeatherItemEnabled = useAppStore((s) => s.setWeatherItemEnabled);
  const setPurposeItemEnabled = useAppStore((s) => s.setPurposeItemEnabled);
  const addCustomKeyword = useAppStore((s) => s.addCustomKeyword);
  const removeCustomKeyword = useAppStore((s) => s.removeCustomKeyword);

  const [editingTime, setEditingTime] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [timeDraft, setTimeDraft] = useState(departureTime);
  const [editingSensitivity, setEditingSensitivity] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [wifiRegisterStatus, setWifiRegisterStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!visible) return;

    const check = () => {
      CalendarService.checkPermission().then((status) =>
        setCalendarConnected(status === 'authorized')
      );
    };
    check();

    // 이 패널을 연 채로 "설정 열기"를 눌러 OS 설정으로 갔다 돌아온 경우도 반영
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setEditingTime(false);
      setEditingSensitivity(false);
      setWifiRegisterStatus('idle');
      setKeywordDraft('');
    }
  }, [visible]);

  // 출발 시각 입력 — 매 키 입력마다 store에 바로 커밋하면 그때마다 App.tsx의
  // 알림 재예약 + Wi-Fi 재arm effect가 함께 실행돼 불필요하게 잦다. 로컬 임시값에만
  // 반영하다가 "완료"를 눌렀을 때 한 번만 커밋한다.
  const handleTimeEditStart = () => {
    setTimeDraft(departureTime);
    setEditingTime(true);
  };

  const handleTimeDone = () => {
    updateDepartureTime(timeDraft);
    setEditingTime(false);
  };

  const handleSensitivityChange = (level: 1 | 2 | 3 | 4 | 5) => {
    setSensitivity(level);
    updateDeltaOffset(SENSITIVITY_DELTA[level]);
  };

  // 요일 칩 토글 — days가 없으면(매일) 해당 요일 하나만 끈 6일짜리 배열로 시작한다.
  const handleToggleRoutineDay = (routineId: string, currentDays: number[] | undefined, day: number) => {
    const days = currentDays ?? [0, 1, 2, 3, 4, 5, 6];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    setRoutineDays(routineId, next);
  };

  const handleAddKeyword = () => {
    if (!purposeId || !keywordDraft.trim()) return;
    addCustomKeyword(purposeId, keywordDraft);
    setKeywordDraft('');
  };

  const handleRegisterWifi = async () => {
    const bssid = await WifiMonitorService.registerCurrentWifiAsHome();
    if (bssid) {
      setHomeBssid(bssid);
      setWifiRegisterStatus('success');
    } else {
      setWifiRegisterStatus('error');
    }
  };

  const deltaColor =
    deltaOffset > 0 ? Colors.red500 : deltaOffset < 0 ? Colors.blue500 : Colors.slate600;
  const deltaLabel = deltaOffset > 0 ? `+${deltaOffset}` : `${deltaOffset}`;

  const recentFeedback = feedbackHistory.slice(-3).reverse();

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>설정</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={Colors.slate500} />
          </Pressable>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>외출 시간</Text>
          {editingTime ? (
            <View style={styles.timeEditRow}>
              <TimeInput value={timeDraft} onChange={setTimeDraft} compact autoFocus />
              <Pressable
                style={styles.timeDoneButton}
                onPress={handleTimeDone}
                hitSlop={8}
              >
                <Check size={14} color={Colors.emerald600} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={handleTimeEditStart}>
              <Text style={styles.rowValue}>{departureTime}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Δt 보정치</Text>
          <Text style={[styles.rowValue, { color: deltaColor }]}>{deltaLabel}°C</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>체온 민감도</Text>
          <Pressable onPress={() => setEditingSensitivity((v) => !v)}>
            <Text style={styles.calendarSettingsLink}>
              {editingSensitivity ? '닫기' : '재조정'}
            </Text>
          </Pressable>
        </View>
        {editingSensitivity ? (
          <View style={styles.sensitivityEditArea}>
            <SensitivitySelector value={sensitivityLevel} onChange={handleSensitivityChange} />
          </View>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.rowLabel}>홈 Wi-Fi</Text>
          <Pressable onPress={handleRegisterWifi}>
            <Text style={styles.calendarSettingsLink}>{homeBssid ? '재등록' : '등록'}</Text>
          </Pressable>
        </View>
        {wifiRegisterStatus === 'success' ? (
          <Text style={styles.wifiStatusSuccess}>지금 연결된 Wi-Fi를 홈으로 등록했어요.</Text>
        ) : null}
        {wifiRegisterStatus === 'error' ? (
          <Text style={styles.wifiStatusError}>Wi-Fi에 연결돼 있지 않아요.</Text>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.rowLabel}>캘린더 연동</Text>
          {calendarConnected ? (
            <Text style={styles.rowValue}>연결됨</Text>
          ) : (
            <Pressable onPress={() => CalendarService.openSettings()}>
              <Text style={styles.calendarSettingsLink}>권한 없음 · 설정 열기</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.sectionTitle}>날씨 알림 항목</Text>
        {WEATHER_ITEMS.map((weatherItem) => {
          const enabled = !disabledWeatherItems.includes(weatherItem.label);
          return (
            <View key={weatherItem.label} style={styles.weatherRow}>
              <View style={styles.weatherTextArea}>
                <Text style={styles.routineLabel}>{weatherItem.label}</Text>
                <Text style={styles.weatherDescription}>{weatherItem.description}</Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={(value) => setWeatherItemEnabled(weatherItem.label, value)}
                trackColor={{ false: Colors.slate200, true: Colors.indigo600 }}
                thumbColor={Colors.white}
              />
            </View>
          );
        })}

        {purposeId && (
          <>
            <Text style={styles.sectionTitle}>{PURPOSES[purposeId].label} 준비물</Text>
            {PURPOSES[purposeId].items.map((purposeItem) => {
              const enabled = !disabledPurposeItems.includes(`${purposeId}:${purposeItem.label}`);
              return (
                <View key={purposeItem.label} style={styles.weatherRow}>
                  <View style={styles.weatherTextArea}>
                    <Text style={styles.routineLabel}>{purposeItem.label}</Text>
                    <Text style={styles.weatherDescription}>{purposeItem.note}</Text>
                  </View>
                  <Switch
                    value={enabled}
                    onValueChange={(value) => setPurposeItemEnabled(purposeId, purposeItem.label, value)}
                    trackColor={{ false: Colors.slate200, true: Colors.indigo600 }}
                    thumbColor={Colors.white}
                  />
                </View>
              );
            })}

            <Text style={styles.sectionTitle}>{PURPOSES[purposeId].label} 자동감지 키워드</Text>
            <Text style={styles.weatherDescription}>
              캘린더 일정 제목에 이 단어가 있으면 자동으로 "{PURPOSES[purposeId].label}"로 인식해요.
            </Text>
            <View style={styles.keywordChipRow}>
              {PURPOSES[purposeId].calKeywords.map((kw) => (
                <View key={kw} style={styles.keywordChipReadonly}>
                  <Text style={styles.keywordChipText}>{kw}</Text>
                </View>
              ))}
              {(customKeywords[purposeId] ?? []).map((kw) => (
                <Pressable
                  key={kw}
                  style={styles.keywordChip}
                  onPress={() => removeCustomKeyword(purposeId, kw)}
                  hitSlop={4}
                >
                  <Text style={styles.keywordChipText}>{kw}</Text>
                  <X size={10} color={Colors.indigo600} />
                </Pressable>
              ))}
            </View>
            <View style={styles.keywordAddRow}>
              <TextInput
                style={styles.keywordInput}
                value={keywordDraft}
                onChangeText={setKeywordDraft}
                placeholder="키워드 추가 (예: 회의)"
                placeholderTextColor={Colors.slate400}
                onSubmitEditing={handleAddKeyword}
                returnKeyType="done"
              />
              <Pressable style={styles.timeDoneButton} onPress={handleAddKeyword} hitSlop={8}>
                <Check size={14} color={Colors.emerald600} />
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>내 루틴</Text>
        {permanentRoutines.length === 0 ? (
          <Text style={styles.emptyText}>등록된 루틴이 없어요.</Text>
        ) : (
          permanentRoutines.map((routine) => {
            const activeDays = routine.days ?? [0, 1, 2, 3, 4, 5, 6];
            return (
              <View key={routine.id} style={styles.routineBlock}>
                <View style={styles.routineRow}>
                  <Text style={styles.routineLabel}>{routine.label}</Text>
                  <Pressable onPress={() => removePermanentRoutine(routine.id)} hitSlop={8}>
                    <X size={16} color={Colors.slate400} />
                  </Pressable>
                </View>
                <View style={styles.dayChipRow}>
                  {DAY_LABELS.map((label, day) => {
                    const active = activeDays.includes(day);
                    return (
                      <Pressable
                        key={day}
                        style={[styles.dayChip, active && styles.dayChipActive]}
                        onPress={() => handleToggleRoutineDay(routine.id, routine.days, day)}
                        hitSlop={4}
                      >
                        <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.sectionTitle}>최근 피드백 기록</Text>
        {recentFeedback.length === 0 ? (
          <Text style={styles.emptyText}>아직 기록이 없어요.</Text>
        ) : (
          recentFeedback.map((record, i) => (
            <View key={`${record.date}-${i}`} style={styles.feedbackRow}>
              <Text style={styles.feedbackDate}>{record.date}</Text>
              <Text style={styles.feedbackValue}>{FEEDBACK_LABELS[record.val]}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 420,
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    zIndex: 20,
    elevation: 20,
    shadowColor: Colors.slate800,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.slate800,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate100,
  },
  rowLabel: {
    fontSize: 13,
    color: Colors.slate500,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.slate800,
  },
  calendarSettingsLink: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.indigo600,
  },
  sensitivityEditArea: {
    paddingTop: 14,
    paddingBottom: 4,
  },
  wifiStatusSuccess: {
    marginTop: -4,
    marginBottom: 8,
    fontSize: 11,
    color: Colors.emerald600,
  },
  wifiStatusError: {
    marginTop: -4,
    marginBottom: 8,
    fontSize: 11,
    color: Colors.red500,
  },
  timeEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeDoneButton: {
    marginLeft: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.emerald100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.slate600,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.slate400,
  },
  routineBlock: {
    paddingVertical: 4,
  },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  dayChipRow: {
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 8,
  },
  dayChip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.slate100,
  },
  dayChipActive: {
    backgroundColor: Colors.indigo600,
  },
  dayChipText: {
    fontSize: 11,
    color: Colors.slate400,
    fontWeight: '600',
  },
  dayChipTextActive: {
    color: Colors.white,
  },
  routineLabel: {
    fontSize: 13,
    color: Colors.slate700,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  weatherTextArea: {
    flex: 1,
  },
  weatherDescription: {
    marginTop: 2,
    fontSize: 11,
    color: Colors.slate400,
  },
  keywordChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  keywordChipReadonly: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Colors.slate100,
  },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Colors.emerald100,
  },
  keywordChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.slate700,
  },
  keywordAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  keywordInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.slate800,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.slate50,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  feedbackDate: {
    fontSize: 12,
    color: Colors.slate400,
  },
  feedbackValue: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.slate600,
  },
});
