import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Linking,
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
import { SensitivitySelector } from './SensitivitySelector';
import { TimeInput } from './TimeInput';
import { PersonalizeModal } from './PersonalizeModal';
import { ChoiceList } from './ChoiceList';
import { ALERT_PREFERENCE_CHOICES, COMMUTE_CHOICES, isAwayPlaceAlertOn } from '../constants/preferences';
import { hasMotionPermission, isMotionSupported, requestMotionPermission, syncWalkingDetection } from '../../modules/ahmatda-motion';
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

  const [editingTime, setEditingTime] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [timeDraft, setTimeDraft] = useState(departureTime);
  const [editingNightly, setEditingNightly] = useState(false);
  const [nightlyDraft, setNightlyDraft] = useState(nightlyCheckTime);
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

  useEffect(() => {
    if (!visible) return;

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

    // 이 패널을 연 채로 "설정 열기"를 눌러 OS 설정으로 갔다 돌아온 경우도 반영
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setEditingTime(false);
      setEditingNightly(false);
      setEditingSensitivity(false);
      setWifiRegisterStatus('idle');
      setHomeRegisterStatus('idle');
      setKeywordDraft('');
      setAiKeyDraft('');
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    AiKeyStore.get(ai.provider).then((key) => setAiHasKey(!!key));
  }, [visible, ai.provider]);

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

  // 자기 전 정리 시각도 같은 이유로 "완료"에서만 커밋한다 (바뀔 때마다 알림 재예약).
  const handleNightlyEditStart = () => {
    setNightlyDraft(nightlyCheckTime);
    setEditingNightly(true);
  };

  const handleNightlyDone = () => {
    setNightlyCheckTime(nightlyDraft);
    setEditingNightly(false);
  };

  // 기준값만 바꾼다. 일일 피드백으로 쌓인 learnedDelta는 그대로 두므로,
  // 민감도를 다시 골라도 그동안의 학습이 사라지지 않는다.
  const handleSensitivityChange = (level: 1 | 2 | 3 | 4 | 5) => {
    setSensitivity(level);
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
          <Text style={styles.rowLabel}>자기 전 정리 시간</Text>
          {editingNightly ? (
            <View style={styles.timeEditRow}>
              <TimeInput value={nightlyDraft} onChange={setNightlyDraft} compact autoFocus />
              <Pressable
                style={styles.timeDoneButton}
                onPress={handleNightlyDone}
                hitSlop={8}
              >
                <Check size={14} color={Colors.emerald600} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={handleNightlyEditStart}>
              <Text style={styles.rowValue}>{nightlyCheckTime}</Text>
            </Pressable>
          )}
        </View>

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
          <Switch
            value={awayPlaceOn}
            onValueChange={handleAwayPlaceToggle}
            disabled={!isMotionSupported()}
            trackColor={{ false: Colors.slate200, true: Colors.indigo600 }}
            thumbColor={Colors.white}
          />
        </View>

        <Text style={styles.sectionTitle}>주 이동수단</Text>
        <ChoiceList choices={COMMUTE_CHOICES} value={commuteMode} onChange={setCommuteMode} />

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
          <Text style={styles.rowLabel}>집 위치</Text>
          <Pressable onPress={handleRegisterHome} disabled={homeRegisterStatus === 'busy'}>
            <Text style={styles.calendarSettingsLink}>
              {homeRegisterStatus === 'busy' ? '확인 중…' : hasHome ? '지금 위치로 재등록' : '지금 위치로 등록'}
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
            <Pressable onPress={handleBackgroundLocation}>
              <Text style={styles.calendarSettingsLink}>켜기</Text>
            </Pressable>
          )}
        </View>

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

        <View style={styles.row}>
          <Text style={styles.rowLabel}>길찾기 앱</Text>
          <Pressable onPress={() => setMapApp(mapApp === 'kakao' ? 'naver' : 'kakao')}>
            <Text style={styles.calendarSettingsLink}>
              {mapApp === 'kakao' ? '카카오맵' : '네이버지도'} · 변경
            </Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <View style={styles.weatherTextArea}>
            <Text style={styles.rowLabel}>AI로 개인화하기</Text>
            <Text style={styles.weatherDescription}>쓰고 있는 AI 앱과 대화해 루틴·키워드를 한 번에 설정 (추가 비용 없음)</Text>
          </View>
          <Pressable onPress={() => setPersonalizeVisible(true)} hitSlop={8}>
            <Text style={styles.calendarSettingsLink}>시작</Text>
          </Pressable>
        </View>
        <PersonalizeModal visible={personalizeVisible} onClose={() => setPersonalizeVisible(false)} />

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

        <Text style={styles.sectionTitle}>AI 일정 해석 (선택)</Text>
        <Text style={styles.weatherDescription}>
          키워드로 알 수 없는 일정(예: 부산 출장)을 Claude가 해석해 준비물을 제안해요. 본인의
          Anthropic API 키가 필요해요.
        </Text>
        {aiHasKey ? (
          <>
            <View style={styles.weatherRow}>
              <Text style={styles.routineLabel}>사용하기</Text>
              <Switch
                value={ai.enabled}
                onValueChange={handleAiToggle}
                trackColor={{ false: Colors.slate200, true: Colors.indigo600 }}
                thumbColor={Colors.white}
              />
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
              <Pressable onPress={handleAiKeyRemove} hitSlop={8}>
                <Text style={styles.calendarSettingsLink}>키 삭제</Text>
              </Pressable>
            </View>
            <Pressable onPress={handleAiReport} hitSlop={8}>
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
              placeholderTextColor={Colors.slate400}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handleAiKeySave}
              returnKeyType="done"
            />
            <Pressable style={styles.timeDoneButton} onPress={handleAiKeySave} hitSlop={8}>
              <Check size={14} color={Colors.emerald600} />
            </Pressable>
          </View>
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
  aiReportLink: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.slate400,
    textDecorationLine: 'underline',
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
