import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, ChevronLeft, Plus, X } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSize, Radius, makeStyles, useTheme } from '../constants/theme';
import { PURPOSES, purposeItemKey } from '../constants/purposes';
import { getEffectiveDelta } from '../utils/temperature';
import { getTodayString } from '../utils/time';
import { isOneOff } from '../utils/routines';
import { useAppStore } from '../store';
import { CalendarService } from '../services/calendar/CalendarService';
import { WifiMonitorService } from '../services/wifi/WifiMonitorService';
import { HomeGeofence } from '../services/departure/homeGeofence';
import * as Location from 'expo-location';
import { AiKeyStore } from '../services/ai/AiKeyStore';
import { DAILY_CALL_LIMIT } from '../services/ai/hints';
import { SensitivitySelector } from '../components/SensitivitySelector';
import { TimeInput } from '../components/TimeInput';
import { PersonalizeModal } from '../components/PersonalizeModal';
import { DiagnosticsModal } from '../components/DiagnosticsModal';
import { ChoiceList } from '../components/ChoiceList';
import { AlertVoiceSettings } from '../components/AlertVoiceSettings';
import { AlarmSettings } from '../components/AlarmSettings';
import { Toast } from '../components/Toast';
import { ALERT_PREFERENCE_CHOICES, COMMUTE_CHOICES, isAwayPlaceAlertOn } from '../constants/preferences';
import { hasMotionPermission, isMotionSupported, requestMotionPermission, syncWalkingDetection } from '../../modules/ahmatda-motion';
import type { FeedbackType, MapApp } from '../types';

const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  cold: '추웠음',
  good: '적당함',
  hot: '더웠음',
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const MAP_APP_CHOICES: { value: MapApp; label: string }[] = [
  { value: 'kakao', label: '카카오맵' },
  { value: 'naver', label: '네이버지도' },
];

// 글자만 있는 링크("등록", "켜기")는 글자 높이만큼만 눌린다 — 위아래로 넉넉히 넓힌다.
const LINK_HIT_SLOP = { top: 14, bottom: 14, left: 12, right: 12 };

// 개인정보처리방침(legal/privacy-policy.ko.md)의 문의 연락처와 같아야 한다.
const SUPPORT_EMAIL = 'ko021954@gmail.com';

// AI 연결 동의 문구 — App Store 심사 5.1.2(i): 무엇을, 누구에게 보내는지 밝히고
// 보내기 전에 명시적 동의를 받는다. 실제로 보내는 데이터(services/ai/anthropic.ts)와
// 반드시 일치해야 한다.
const AI_CONSENT_MESSAGE = [
  '키워드로 알 수 없는 캘린더 일정의 "제목"만 Anthropic(미국)의 Claude API로 전송해요.',
  '',
  '보내지 않는 것: 일정 시간, 장소, 메모, 위치',
  '전송은 입력하신 API 키로 이뤄지고, 요금은 키 소유자에게 청구돼요(하루 최대 ' + DAILY_CALL_LIMIT + '회).',
  'Anthropic은 API로 받은 데이터를 모델 학습에 쓰지 않고, 30일 이내에 삭제해요.',
  '',
  '설정에서 언제든 끌 수 있어요.',
].join('\n');

// tier1 날씨 트리거 항목 — buildChecklist()에서 생성하는 라벨과 반드시 일치해야 한다.
const WEATHER_ITEMS: { label: string; description: string }[] = [
  { label: '우산', description: '비·눈 예보 시 표시' },
  { label: '마스크', description: '미세먼지 나쁨·매우나쁨일 때 표시' },
  { label: '물병', description: '폭염 주의보일 때 표시' },
];

function SettingSwitch(props: Pick<React.ComponentProps<typeof Switch>, 'value' | 'onValueChange' | 'disabled' | 'accessibilityLabel'>) {
  const { Colors } = useTheme();
  return <Switch {...props} trackColor={{ false: Colors.slate200, true: Colors.indigo600 }} thumbColor={Colors.onColor} />;
}

interface TimeRowProps {
  label: string;
  value: string; // "HH:mm"
  onCommit: (value: string) => void;
}

// 시각 설정 한 줄. 매 키 입력마다 store에 커밋하면 그때마다 App.tsx의 알림 재예약 +
// Wi-Fi 재arm effect가 함께 실행돼 불필요하게 잦다. 임시값에만 반영하다가 "완료"를
// 눌렀을 때 한 번만 커밋한다.
function TimeRow({ label, value, onCommit }: TimeRowProps) {
  const { Colors } = useTheme();
  const styles = useStyles();
  const [draft, setDraft] = useState<string | null>(null); // null이면 편집 중이 아님

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {draft !== null ? (
        <View style={styles.timeEditRow}>
          <TimeInput value={draft} onChange={setDraft} compact autoFocus />
          <Pressable
            style={styles.timeDoneButton}
            onPress={() => {
              onCommit(draft);
              setDraft(null);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${label} 저장`}
          >
            <Check size={16} color={Colors.emeraldText} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setDraft(value)}
          hitSlop={LINK_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${value}, 눌러서 변경`}
        >
          <Text style={[styles.rowValue, styles.rowValueEditable]}>{value} · 변경</Text>
        </Pressable>
      )}
    </View>
  );
}

// 설정 화면. 예전엔 대시보드 위에 얹는 패널이라 높이가 화면의 일부로 묶이고
// 뒤로 가기가 패널이 아니라 앱을 닫았다. 화면 하나로 두어 뒤로 가기·스크롤이 평범하게 동작한다.
export function SettingsScreen() {
  const { Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const toast = useAppStore((s) => s.toast);
  const toastAction = useAppStore((s) => s.toastAction);
  const clearToast = useAppStore((s) => s.clearToast);

  const departureTime = useAppStore((s) => s.userSettings.departureTime);
  const nightlyCheckTime = useAppStore((s) => s.userSettings.nightlyCheckTime);
  const setNightlyCheckTime = useAppStore((s) => s.setNightlyCheckTime);
  const alertPreference = useAppStore((s) => s.userSettings.alertPreference);
  const commuteMode = useAppStore((s) => s.userSettings.commuteMode);
  const setAlertPreference = useAppStore((s) => s.setAlertPreference);
  const awayPlaceAlert = useAppStore((s) => s.userSettings.awayPlaceAlert);
  const setAwayPlaceAlert = useAppStore((s) => s.setAwayPlaceAlert);
  const awayPlaceOn = isAwayPlaceAlertOn({ alertPreference, awayPlaceAlert });
  const setCommuteMode = useAppStore((s) => s.setCommuteMode);
  const learnedDelta = useAppStore((s) => s.userSettings.learnedDelta);
  const sensitivityLevel = useAppStore((s) => s.userSettings.sensitivityLevel);
  const homeBssid = useAppStore((s) => s.userSettings.homeBssid);
  const disabledWeatherItems = useAppStore((s) => s.userSettings.disabledWeatherItems);
  const disabledPurposeItems = useAppStore((s) => s.userSettings.disabledPurposeItems);
  const customKeywords = useAppStore((s) => s.userSettings.customKeywords);
  const mapApp = useAppStore((s) => s.userSettings.mapApp);
  const purposeId = useAppStore((s) => s.purposeId);
  // "내 루틴"은 반복 항목만 — 특정 날짜 1회 항목은 다음 외출 준비 화면에서 다룬다.
  // (여기서 요일을 고르면 OR 조건이 붙어 매주 나타나 버린다.)
  const allRoutines = useAppStore((s) => s.permanentRoutines);
  const permanentRoutines = useMemo(() => allRoutines.filter((r) => !isOneOff(r)), [allRoutines]);
  const feedbackHistory = useAppStore((s) => s.feedbackHistory);
  const updateDepartureTime = useAppStore((s) => s.updateDepartureTime);
  const setSensitivity = useAppStore((s) => s.setSensitivity);
  const setMapApp = useAppStore((s) => s.setMapApp);
  const setHomeBssid = useAppStore((s) => s.setHomeBssid);
  const removePermanentRoutine = useAppStore((s) => s.removePermanentRoutine);
  const setRoutineDays = useAppStore((s) => s.setRoutineDays);
  const setWeatherItemEnabled = useAppStore((s) => s.setWeatherItemEnabled);
  const setPurposeItemEnabled = useAppStore((s) => s.setPurposeItemEnabled);
  const addCustomKeyword = useAppStore((s) => s.addCustomKeyword);
  const removeCustomKeyword = useAppStore((s) => s.removeCustomKeyword);
  const ai = useAppStore((s) => s.ai);
  const setAiEnabled = useAppStore((s) => s.setAiEnabled);
  const setAiConsent = useAppStore((s) => s.setAiConsent);

  const addPermanentRoutine = useAppStore((s) => s.addPermanentRoutine);
  const showToast = useAppStore((s) => s.showToast);
  const [routineDraft, setRoutineDraft] = useState('');
  const [routineMessage, setRoutineMessage] = useState<string | null>(null);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [editingSensitivity, setEditingSensitivity] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [wifiRegisterStatus, setWifiRegisterStatus] = useState<'idle' | 'success' | 'error'>('idle');
  // 집 위치·위치 '항상 허용' — 외출 판정의 위치 신호 (docs/외출-감지-재설계.md 3장)
  const [hasHome, setHasHome] = useState(false);
  const [homeRegisterStatus, setHomeRegisterStatus] = useState<'idle' | 'busy' | 'active' | 'saved' | 'error'>('idle');
  const [bgLocation, setBgLocation] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [motionGranted, setMotionGranted] = useState(false);
  // 키 자체는 화면 상태에 들고 있지 않는다 — 있는지 여부만 안다.
  const [aiHasKey, setAiHasKey] = useState(false);
  const [aiKeyDraft, setAiKeyDraft] = useState('');
  const [personalizeVisible, setPersonalizeVisible] = useState(false);
  // 실기기 검증용 진단 화면 — "설정" 제목을 길게 눌러 연다 (docs/실기기-검증-가이드.md)
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);

  useEffect(() => {
    const check = () => {
      CalendarService.checkPermission().then((status) =>
        setCalendarConnected(status === 'authorized')
      );
      HomeGeofence.getHomeCoords().then((c) => setHasHome(c !== null));
      hasMotionPermission().then(setMotionGranted).catch(() => {});
      Location.getBackgroundPermissionsAsync()
        .then((r) => setBgLocation(r.granted ? 'granted' : r.status === 'undetermined' ? 'undetermined' : 'denied'))
        .catch(() => {});
    };
    check();

    // 이 화면을 연 채로 "설정 열기"를 눌러 OS 설정으로 갔다 돌아온 경우도 반영
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    AiKeyStore.get(ai.provider).then((key) => setAiHasKey(!!key));
  }, [ai.provider]);

  // 요일 칩 토글 — days가 없으면(매일) 해당 요일 하나만 끈 6일짜리 배열로 시작한다.
  const handleToggleRoutineDay = (routineId: string, currentDays: number[] | undefined, day: number) => {
    const days = currentDays ?? [0, 1, 2, 3, 4, 5, 6];
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    setRoutineDays(routineId, next);
  };

  // 루틴은 대시보드 입력창의 작은 링크로만 넣을 수 있었다 — 루틴을 보는 자리에서 바로 넣게 한다.
  const handleAddRoutine = () => {
    const label = routineDraft.trim();
    if (!label) return;
    if (addPermanentRoutine(label)) {
      setRoutineDraft('');
      setRoutineMessage(null);
    } else {
      setRoutineMessage(`'${label}'은(는) 이미 루틴에 있어요.`);
    }
  };

  const handleRemoveRoutine = (id: string, label: string) => {
    const undo = removePermanentRoutine(id);
    if (undo) showToast(`'${label}' 루틴을 지웠어요.`, { label: '되돌리기', onPress: undo });
  };

  const handleAddKeyword = () => {
    if (!purposeId || !keywordDraft.trim()) return;
    addCustomKeyword(purposeId, keywordDraft);
    setKeywordDraft('');
  };

  // 켜기는 항상 동의를 거치고, 끄기는 동의 철회다 — 개인정보처리방침에 "끄면 동의도
  // 철회된다"고 고지하므로, 다시 켤 때 동의를 건너뛰면 안 된다.
  const handleAiToggle = (value: boolean) => {
    if (!value) {
      setAiConsent(null);
      return;
    }
    Alert.alert('AI 일정 해석 켜기', AI_CONSENT_MESSAGE, [
      { text: '취소', style: 'cancel' },
      {
        text: '동의하고 켜기',
        onPress: () => {
          setAiConsent(ai.provider);
          setAiEnabled(true);
        },
      },
    ]);
  };

  const handleAiKeySave = async () => {
    const draft = aiKeyDraft.trim();
    if (!draft) return;
    const saved = await AiKeyStore.set(ai.provider, draft);
    setAiKeyDraft('');
    setAiHasKey(saved);
    // 새 키를 넣었으면 "키 무효"로 멈춰 있던 상태를 푼다(동의는 유지).
    if (saved && ai.consentedProvider) setAiConsent(ai.consentedProvider);
  };

  // 키를 지우면 동의도 함께 철회한다 — 다음에 켤 때 다시 동의를 받는다.
  const handleAiKeyRemove = async () => {
    await AiKeyStore.remove(ai.provider);
    setAiHasKey(false);
    setAiConsent(null);
  };

  const handleAiReport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[아맞다] 이상한 AI 제안 신고')}`).catch(() => {});
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

  const handleRegisterHome = async () => {
    setHomeRegisterStatus('busy');
    const result = await HomeGeofence.registerCurrentLocationAsHome();
    if (result) setHasHome(true);
    setHomeRegisterStatus(!result ? 'error' : result.active ? 'active' : 'saved');
  };

  // 집 밖 머묾 알림은 위치 '항상 허용'과 신체 활동(정지·걷기)이 있어야 동작한다 — 켤 때 없으면
  // 권한다 (docs/외출-감지-재설계.md 4장 "켤 때 '항상 허용'을 권장하는 안내").
  const recommendPermissionsIfNeeded = async () => {
    if (isMotionSupported() && !motionGranted) {
      const granted = await requestMotionPermission().catch(() => false);
      setMotionGranted(granted);
      if (granted) syncWalkingDetection();
    }
    if (bgLocation !== 'granted') await handleBackgroundLocation();
  };

  const handleAlertPreference = (pref: typeof alertPreference) => {
    if (pref === alertPreference) return;
    setAlertPreference(pref);
    if (pref === 'frequent') recommendPermissionsIfNeeded();
  };

  const handleAwayPlaceToggle = (on: boolean) => {
    setAwayPlaceAlert(on);
    if (on) recommendPermissionsIfNeeded();
  };

  // 온보딩과 같은 안내·재요청 판단을 HomeGeofence가 한다 (Play "눈에 띄는 공개").
  const handleBackgroundLocation = async () => {
    const result = await HomeGeofence.promptBackgroundPermission();
    if (result === 'granted' || result === 'denied') setBgLocation(result);
  };

  // 화면에는 실제 적용되는 Δt(기준값 + 학습값)를 보여준다.
  const effectiveDelta = getEffectiveDelta(sensitivityLevel, learnedDelta);
  const deltaColor =
    effectiveDelta > 0 ? Colors.red500 : effectiveDelta < 0 ? Colors.blue500 : Colors.slate600;
  const deltaLabel = effectiveDelta > 0 ? `+${effectiveDelta}` : `${effectiveDelta}`;

  const recentFeedback = feedbackHistory.slice(-3).reverse();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
        >
          <ChevronLeft size={26} color={Colors.slate700} />
        </Pressable>
        {/* 제목을 길게 누르면 실기기 검증용 진단 화면이 열린다 */}
        <Text style={styles.headerTitle} onLongPress={() => setDiagnosticsVisible(true)} suppressHighlighting accessibilityRole="header">설정</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.groupTitle, styles.groupTitleFirst]} accessibilityRole="header">시간 · 알림</Text>
        <TimeRow label="외출 시간" value={departureTime} onCommit={updateDepartureTime} />
        <TimeRow label="자기 전 정리 시간" value={nightlyCheckTime} onCommit={setNightlyCheckTime} />

        <Text style={styles.sectionTitle}>알림 성향</Text>
        <ChoiceList choices={ALERT_PREFERENCE_CHOICES} value={alertPreference} onChange={handleAlertPreference} />
        <View style={styles.weatherRow}>
          <View style={styles.weatherTextArea}>
            <Text style={styles.routineLabel}>집 밖에서 떠날 때 알림</Text>
            <Text style={styles.weatherDescription}>
              {!isMotionSupported()
                ? '이 기기에서는 아직 쓸 수 없어요'
                : awayPlaceOn && (bgLocation !== 'granted' || !motionGranted)
                  ? `켜져 있지만 ${bgLocation !== 'granted' ? "위치 '항상 허용'" : '신체 활동 권한'}이 있어야 동작해요`
                  : '20분 넘게 머문 곳을 떠날 때, 아침에 챙긴 충전기·우산 같은 물건을 알려요 (하루 3번까지)'}
            </Text>
          </View>
          <SettingSwitch value={awayPlaceOn} onValueChange={handleAwayPlaceToggle} disabled={!isMotionSupported()} accessibilityLabel="집 밖에서 떠날 때 알림" />
        </View>

        <AlertVoiceSettings titleStyle={styles.sectionTitle} onMessage={(text) => showToast(text)} />

        <AlarmSettings
          titleStyle={styles.sectionTitle}
          onMessage={(text, undo) => showToast(text, undo ? { label: '되돌리기', onPress: undo } : undefined)}
        />

        <Text style={styles.groupTitle} accessibilityRole="header">내 체크리스트</Text>
        <Text style={styles.sectionTitle}>내 루틴</Text>
        <Text style={styles.weatherDescription}>나갈 때마다 챙기는 것. 요일을 눌러 그 요일에만 뜨게 할 수 있어요.</Text>
        <View style={styles.keywordAddRow}>
          <TextInput
            style={styles.keywordInput}
            value={routineDraft}
            onChangeText={(text) => {
              setRoutineDraft(text);
              setRoutineMessage(null);
            }}
            placeholder="루틴 추가 (예: 사원증)"
            placeholderTextColor={Colors.slate500}
            onSubmitEditing={handleAddRoutine}
            returnKeyType="done"
            submitBehavior="submit"
            maxLength={40}
            accessibilityLabel="루틴 추가"
          />
          <Pressable
            style={[styles.addButton, !routineDraft.trim() && styles.addButtonDisabled]}
            onPress={handleAddRoutine}
            disabled={!routineDraft.trim()}
            accessibilityRole="button"
            accessibilityLabel="루틴 추가"
          >
            <Plus size={18} color={Colors.onColor} />
          </Pressable>
        </View>
        {routineMessage ? <Text style={styles.wifiStatusError}>{routineMessage}</Text> : null}
        {permanentRoutines.length === 0 ? (
          <Text style={styles.emptyText}>등록된 루틴이 없어요.</Text>
        ) : (
          permanentRoutines.map((routine) => {
            const activeDays = routine.days ?? [0, 1, 2, 3, 4, 5, 6];
            return (
              <View key={routine.id} style={styles.routineBlock}>
                <View style={styles.routineRow}>
                  <Text style={styles.routineName}>{routine.label}</Text>
                  <Text style={styles.routineDaysSummary}>{routine.days && routine.days.length > 0 ? '고른 요일만' : '매일'}</Text>
                  <Pressable
                    style={styles.closeButton}
                    onPress={() => handleRemoveRoutine(routine.id, routine.label)}
                    accessibilityRole="button"
                    accessibilityLabel={`${routine.label} 루틴 삭제`}
                  >
                    <X size={18} color={Colors.slate500} />
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
                        hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                        accessibilityLabel={`${routine.label} ${label}요일`}
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

        <Text style={styles.sectionTitle}>날씨 알림 항목</Text>
        {WEATHER_ITEMS.map((weatherItem) => {
          const enabled = !disabledWeatherItems.includes(weatherItem.label);
          return (
            <View key={weatherItem.label} style={styles.weatherRow}>
              <View style={styles.weatherTextArea}>
                <Text style={styles.routineLabel}>{weatherItem.label}</Text>
                <Text style={styles.weatherDescription}>{weatherItem.description}</Text>
              </View>
              <SettingSwitch value={enabled} onValueChange={(value) => setWeatherItemEnabled(weatherItem.label, value)} accessibilityLabel={`${weatherItem.label}, ${weatherItem.description}`} />
            </View>
          );
        })}

        {purposeId && (
          <>
            <Text style={styles.sectionTitle}>{PURPOSES[purposeId].label} 준비물</Text>
            {PURPOSES[purposeId].items.map((purposeItem) => {
              const enabled = !disabledPurposeItems.includes(purposeItemKey(purposeId, purposeItem.label));
              return (
                <View key={purposeItem.label} style={styles.weatherRow}>
                  <View style={styles.weatherTextArea}>
                    <Text style={styles.routineLabel}>{purposeItem.label}</Text>
                    <Text style={styles.weatherDescription}>{purposeItem.note}</Text>
                  </View>
                  <SettingSwitch
                    value={enabled}
                    onValueChange={(value) => setPurposeItemEnabled(purposeId, purposeItem.label, value)}
                    accessibilityLabel={`${purposeItem.label}, ${purposeItem.note}`}
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
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`키워드 ${kw} 삭제`}
                >
                  <Text style={styles.keywordChipText}>{kw}</Text>
                  <X size={10} color={Colors.indigoText} />
                </Pressable>
              ))}
            </View>
            <View style={styles.keywordAddRow}>
              <TextInput
                style={styles.keywordInput}
                value={keywordDraft}
                onChangeText={setKeywordDraft}
                placeholder="키워드 추가 (예: 회의)"
                placeholderTextColor={Colors.slate500}
                onSubmitEditing={handleAddKeyword}
                returnKeyType="done"
              />
              <Pressable style={styles.timeDoneButton} onPress={handleAddKeyword} hitSlop={8} accessibilityRole="button" accessibilityLabel="키워드 추가">
                <Check size={14} color={Colors.emeraldText} />
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.groupTitle} accessibilityRole="header">날씨 · 체감온도</Text>
        <Text style={styles.sectionTitle}>주 이동수단</Text>
        <ChoiceList choices={COMMUTE_CHOICES} value={commuteMode} onChange={setCommuteMode} />

        <View style={styles.row}>
          <View style={styles.weatherTextArea}>
            <Text style={styles.rowLabel}>체감온도 보정</Text>
            <Text style={styles.weatherDescription}>민감도와 옷차림 피드백으로 정해져요. 실제 기온에 이만큼 더해 보여줘요.</Text>
          </View>
          <Text style={[styles.rowValue, { color: deltaColor }]}>{deltaLabel}°C</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>체온 민감도</Text>
          <Pressable
            onPress={() => setEditingSensitivity((v) => !v)}
            hitSlop={LINK_HIT_SLOP}
            accessibilityRole="button"
            accessibilityState={{ expanded: editingSensitivity }}
            accessibilityLabel="체온 민감도 다시 고르기"
          >
            <Text style={styles.calendarSettingsLink}>
              {editingSensitivity ? '닫기' : '다시 고르기'}
            </Text>
          </Pressable>
        </View>
        {editingSensitivity ? (
          <View style={styles.sensitivityEditArea}>
            {/* 기준값만 바꾼다. 일일 피드백으로 쌓인 learnedDelta는 그대로 두므로,
                민감도를 다시 골라도 그동안의 학습이 사라지지 않는다. */}
            <SensitivitySelector value={sensitivityLevel} onChange={setSensitivity} />
          </View>
        ) : null}

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

        <Text style={styles.groupTitle} accessibilityRole="header">외출 감지</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>홈 Wi-Fi</Text>
          <Pressable onPress={handleRegisterWifi} hitSlop={LINK_HIT_SLOP} accessibilityRole="button" accessibilityLabel={homeBssid ? '홈 Wi-Fi 다시 등록' : '홈 Wi-Fi 등록'}>
            <Text style={styles.calendarSettingsLink}>{homeBssid ? '등록됨 · 다시 등록' : '지금 Wi-Fi로 등록'}</Text>
          </Pressable>
        </View>
        {wifiRegisterStatus === 'success' ? (
          <Text style={styles.wifiStatusSuccess}>지금 연결된 Wi-Fi를 홈으로 등록했어요.</Text>
        ) : null}
        {wifiRegisterStatus === 'error' ? (
          <Text style={styles.wifiStatusError}>Wi-Fi에 연결돼 있지 않아요.</Text>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.rowLabel}>집 위치</Text>
          <Pressable onPress={handleRegisterHome} disabled={homeRegisterStatus === 'busy'} hitSlop={LINK_HIT_SLOP} accessibilityRole="button">
            <Text style={styles.calendarSettingsLink}>
              {homeRegisterStatus === 'busy' ? '확인 중…' : hasHome ? '등록됨 · 지금 위치로 다시 등록' : '지금 위치로 등록'}
            </Text>
          </Pressable>
        </View>
        {homeRegisterStatus === 'active' ? (
          <Text style={styles.wifiStatusSuccess}>지금 위치를 집으로 등록했어요. 이 기기에만 저장돼요.</Text>
        ) : null}
        {homeRegisterStatus === 'saved' ? (
          <Text style={styles.wifiStatusSuccess}>집 위치를 저장했어요. 아래 '위치 항상 허용'을 켜야 집을 벗어나는 걸 알아채요.</Text>
        ) : null}
        {homeRegisterStatus === 'error' ? (
          <Text style={styles.wifiStatusError}>위치를 가져오지 못했어요. 위치 권한과 위치 서비스를 확인해주세요.</Text>
        ) : null}

        <View style={styles.row}>
          <Text style={styles.rowLabel}>위치 항상 허용 (권장)</Text>
          {bgLocation === 'granted' ? (
            <Text style={styles.rowValue}>허용됨</Text>
          ) : (
            <Pressable onPress={handleBackgroundLocation} hitSlop={LINK_HIT_SLOP} accessibilityRole="button" accessibilityLabel="위치 항상 허용 켜기">
              <Text style={styles.calendarSettingsLink}>켜기</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.groupTitle} accessibilityRole="header">연결</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>캘린더 연동</Text>
          {calendarConnected ? (
            <Text style={styles.rowValue}>연결됨</Text>
          ) : (
            <Pressable onPress={() => CalendarService.openSettings()} hitSlop={LINK_HIT_SLOP} accessibilityRole="button">
              <Text style={styles.calendarSettingsLink}>권한 없음 · 설정 열기</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>길찾기 앱</Text>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {MAP_APP_CHOICES.map((choice) => {
              const selected = mapApp === choice.value;
              return (
                <Pressable
                  key={choice.value}
                  style={[styles.segmentOption, selected && styles.segmentOptionSelected]}
                  onPress={() => setMapApp(choice.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={choice.label}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{choice.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.weatherTextArea}>
            <Text style={styles.rowLabel}>AI로 개인화하기</Text>
            <Text style={styles.weatherDescription}>쓰고 있는 AI 앱과 대화해 루틴·키워드를 한 번에 설정 (추가 비용 없음)</Text>
          </View>
          <Pressable onPress={() => setPersonalizeVisible(true)} hitSlop={LINK_HIT_SLOP} accessibilityRole="button" accessibilityLabel="AI로 개인화하기 시작">
            <Text style={styles.calendarSettingsLink}>시작</Text>
          </Pressable>
        </View>
        <PersonalizeModal visible={personalizeVisible} onClose={() => setPersonalizeVisible(false)} />
        <DiagnosticsModal visible={diagnosticsVisible} onClose={() => setDiagnosticsVisible(false)} />

        <Text style={styles.sectionTitle}>AI 일정 해석 (선택)</Text>
        <Text style={styles.weatherDescription}>
          키워드로 알 수 없는 일정(예: 부산 출장)을 Claude가 해석해 준비물을 제안해요. 본인의
          Anthropic API 키가 필요해요.
        </Text>
        {aiHasKey ? (
          <>
            <View style={styles.weatherRow}>
              <Text style={styles.routineLabel}>사용하기</Text>
              <SettingSwitch value={ai.enabled} onValueChange={handleAiToggle} accessibilityLabel="AI 일정 해석 사용하기" />
            </View>
            {ai.status === 'invalidKey' ? (
              <Text style={styles.wifiStatusError}>API 키가 거부됐어요. 키를 삭제하고 올바른 키를 다시 넣어주세요.</Text>
            ) : null}
            {ai.status === 'quotaExceeded' ? (
              <Text style={styles.wifiStatusError}>요청 한도나 잔액이 부족해요. 내일 다시 시도해요.</Text>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>
                이번 달 {ai.usage.month === getTodayString().slice(0, 7) ? ai.usage.monthCalls : 0}회 호출 · 하루 최대 {DAILY_CALL_LIMIT}회
              </Text>
              <Pressable onPress={handleAiKeyRemove} hitSlop={LINK_HIT_SLOP} accessibilityRole="button">
                <Text style={styles.calendarSettingsLink}>키 삭제</Text>
              </Pressable>
            </View>
            <Pressable onPress={handleAiReport} hitSlop={LINK_HIT_SLOP} accessibilityRole="link">
              <Text style={styles.aiReportLink}>이상한 제안 신고하기</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.keywordAddRow}>
            <TextInput
              style={styles.keywordInput}
              value={aiKeyDraft}
              onChangeText={setAiKeyDraft}
              placeholder="Anthropic API 키 (sk-ant-...)"
              placeholderTextColor={Colors.slate500}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleAiKeySave}
              returnKeyType="done"
            />
            <Pressable style={styles.timeDoneButton} onPress={handleAiKeySave} hitSlop={8} accessibilityRole="button" accessibilityLabel="API 키 저장">
              <Check size={14} color={Colors.emeraldText} />
            </Pressable>
          </View>
        )}
      </ScrollView>

      {toast ? <Toast message={toast} action={toastAction} onDone={clearToast} bottomOffset={insets.bottom + 24} /> : null}
    </View>
  );
}

const useStyles = makeStyles(({ Colors, Role, Shadow }) => ({
  screen: {
    flex: 1,
    backgroundColor: Role.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  // 아이콘만 있는 버튼의 터치 영역 (44×44)
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 줄 끝의 ✕ 버튼 (44×44). 오른쪽 여백만큼 당겨 아이콘이 가장자리에 맞게.
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -12,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  // 묶음 제목 — 설정이 한 줄로 길게 이어져 원하는 항목을 찾기 어려웠다. 다섯 묶음으로 나눈다.
  groupTitle: {
    marginTop: 22,
    marginBottom: 4,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.slate200,
    fontSize: FontSize.heading,
    fontWeight: '800',
    color: Colors.slate800,
  },
  groupTitleFirst: {
    marginTop: 8,
  },
  headerTitle: {
    fontSize: FontSize.title,
    fontWeight: '700',
    color: Colors.slate800,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate100,
  },
  rowLabel: {
    fontSize: FontSize.body,
    color: Colors.slate700,
  },
  rowValue: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.slate800,
  },
  // 눌러서 바꿀 수 있는 값이라는 걸 색으로 알린다 (다른 "변경" 링크들과 같은 색)
  rowValueEditable: {
    color: Colors.indigoText,
  },
  calendarSettingsLink: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.indigoText,
  },
  sensitivityEditArea: {
    paddingTop: 14,
    paddingBottom: 4,
  },
  wifiStatusSuccess: {
    marginTop: 6,
    marginBottom: 8,
    fontSize: FontSize.caption,
    color: Colors.emeraldText,
  },
  wifiStatusError: {
    marginTop: 6,
    marginBottom: 8,
    fontSize: FontSize.caption,
    color: Colors.red500,
  },
  timeEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeDoneButton: {
    marginLeft: 8,
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: Colors.emerald100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.slate700,
  },
  emptyText: {
    marginTop: 8,
    fontSize: FontSize.label,
    color: Colors.slate500,
  },
  routineBlock: {
    paddingVertical: 4,
  },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routineName: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.slate800,
  },
  routineDaysSummary: {
    fontSize: FontSize.caption,
    color: Colors.slate500,
  },
  dayChipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 10,
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
    color: Colors.slate500,
    fontWeight: '600',
  },
  dayChipTextActive: {
    color: Colors.onColor,
  },
  routineLabel: {
    fontSize: FontSize.body,
    color: Colors.slate800,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 8,
    gap: 12,
  },
  weatherTextArea: {
    flex: 1,
  },
  weatherDescription: {
    marginTop: 2,
    fontSize: FontSize.caption,
    lineHeight: 17,
    color: Colors.slate500,
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
    borderRadius: Radius.md,
    backgroundColor: Colors.slate100,
  },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.emerald100,
  },
  keywordChipText: {
    fontSize: FontSize.caption,
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
    minHeight: 44,
    fontSize: FontSize.body,
    color: Colors.slate800,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.slate100,
  },
  addButton: {
    marginLeft: 8,
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.indigo600,
  },
  addButtonDisabled: {
    backgroundColor: Colors.slate300,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: Colors.slate100,
    borderRadius: Radius.md,
    padding: 3,
  },
  segmentOption: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
  },
  segmentOptionSelected: {
    backgroundColor: Colors.white,
  },
  segmentText: {
    fontSize: FontSize.label,
    fontWeight: '600',
    color: Colors.slate500,
  },
  segmentTextSelected: {
    color: Colors.indigoText,
  },
  aiReportLink: {
    marginTop: 12,
    fontSize: FontSize.label,
    color: Colors.slate500,
    textDecorationLine: 'underline',
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  feedbackDate: {
    fontSize: FontSize.label,
    color: Colors.slate500,
  },
  feedbackValue: {
    fontSize: FontSize.label,
    fontWeight: '600',
    color: Colors.slate600,
  },
}));
