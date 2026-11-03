import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CloudFog,
  Droplets,
  MapPin,
  Mic,
  Settings,
  Wind,
  X,
} from 'lucide-react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { Colors, PurposeColors } from '../constants/colors';
import { PURPOSES, detectPurposeFromEvents, findMatchingEvent } from '../constants/purposes';
import { FEEDBACK_MESSAGES } from '../constants/feedback';
import { useAppStore } from '../store';
import { CalendarService } from '../services/calendar/CalendarService';
import { DirectionsService } from '../services/directions/DirectionsService';
import { WeatherService } from '../services/weather/WeatherService';
import { calcPerceivedTemp, formatPerceivedFormula, formatTemp, getEffectiveDelta } from '../utils/temperature';
import { getAlertTime, getCurrentSlotIndex, getTodayString, parseEventTime } from '../utils/time';
import { pickNextPlaceEvent } from '../utils/directions';
import { getCurrentCoords } from '../utils/location';
import { isWithinKorea } from '../utils/kmaGrid';
import { ChecklistItem } from '../components/ChecklistItem';
import { ProgressBar } from '../components/ProgressBar';
import { PurposeSelector } from '../components/PurposeSelector';
import { Toast } from '../components/Toast';
import { WeatherTimeline } from '../components/WeatherTimeline';
import { SettingsPanel } from '../components/SettingsPanel';
import { AiSuggestionCard } from '../components/AiSuggestionCard';
import { AiHintService } from '../services/ai/AiHintService';
import { pressLeave } from '../services/departure/leave';
import { buildSuggestions, type AiSuggestion } from '../services/ai/hints';
import type { CalendarEvent, ChecklistItem as ChecklistItemType, FeedbackType, PurposeId } from '../types';

// 위치 권한이 없거나 좌표 조회에 실패했을 때만 쓰이는 폴백 좌표 (서울시청)
const FALLBACK_LAT = 37.5665;
const FALLBACK_LON = 126.978;

const TIER_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: '오늘만',
  1: '날씨 알림',
  2: '목적 준비물',
  3: '일상 루틴',
};

const FEEDBACK_OPTIONS: { val: FeedbackType; label: string }[] = [
  { val: 'cold', label: '추웠음' },
  { val: 'good', label: '적당함' },
  { val: 'hot', label: '더웠음' },
];

function sortSection(items: ChecklistItemType[]): ChecklistItemType[] {
  return [...items].sort((a, b) => Number(a.checked) - Number(b.checked));
}

function getCurationBackground(rainAlert: boolean, heatAlert: boolean): string {
  if (rainAlert) return Colors.sky50;
  if (heatAlert) return Colors.orange50;
  return Colors.indigo50;
}

function PulseDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.8, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <View style={styles.pulseWrapper}>
      <View style={styles.pulseDotCore} />
      <Animated.View
        style={[styles.pulseDotRing, { opacity, transform: [{ scale }] }]}
      />
    </View>
  );
}

export function DashboardScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const checklistYRef = useRef(0);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');

  const checklist = useAppStore((s) => s.checklist);
  const checklistDate = useAppStore((s) => s.checklistDate);
  const purposeId = useAppStore((s) => s.purposeId);
  const autoDetected = useAppStore((s) => s.autoDetected);
  const autoDetectedEvent = useAppStore((s) => s.autoDetectedEvent);
  const currentWeather = useAppStore((s) => s.currentWeather);
  const weatherLoading = useAppStore((s) => s.weatherLoading);
  const weatherOutOfArea = useAppStore((s) => s.weatherOutOfArea);
  const weatherTimeline = useAppStore((s) => s.weatherTimeline);
  const userSettings = useAppStore((s) => s.userSettings);
  const todayFeedback = useAppStore((s) => s.todayFeedback);
  const statusDismissed = useAppStore((s) => s.statusDismissed);
  const toast = useAppStore((s) => s.toast);
  const scrollToChecklistRequested = useAppStore((s) => s.scrollToChecklistRequested);
  const aiEnabled = useAppStore((s) => s.ai.enabled);
  const aiHintCache = useAppStore((s) => s.ai.hintCache);

  const setAutoDetected = useAppStore((s) => s.setAutoDetected);
  const setWeather = useAppStore((s) => s.setWeather);
  const setTimeline = useAppStore((s) => s.setTimeline);
  const setWeatherLoading = useAppStore((s) => s.setWeatherLoading);
  const setWeatherOutOfArea = useAppStore((s) => s.setWeatherOutOfArea);
  const buildChecklist = useAppStore((s) => s.buildChecklist);
  const startNewDay = useAppStore((s) => s.startNewDay);
  const setPurpose = useAppStore((s) => s.setPurpose);
  const toggleCheck = useAppStore((s) => s.toggleCheck);
  const checkAll = useAppStore((s) => s.checkAll);
  const uncheckAll = useAppStore((s) => s.uncheckAll);
  const deleteItem = useAppStore((s) => s.deleteItem);
  const addTempItem = useAppStore((s) => s.addTempItem);
  const addPermanentRoutine = useAppStore((s) => s.addPermanentRoutine);
  const applyFeedback = useAppStore((s) => s.applyFeedback);
  const dismissStatus = useAppStore((s) => s.dismissStatus);
  const showToast = useAppStore((s) => s.showToast);
  const clearToast = useAppStore((s) => s.clearToast);
  const clearScrollToChecklistRequest = useAppStore((s) => s.clearScrollToChecklistRequest);
  const acceptAiSuggestion = useAppStore((s) => s.acceptAiSuggestion);
  const rejectAiSuggestion = useAppStore((s) => s.rejectAiSuggestion);

  const [refreshing, setRefreshing] = useState(false);
  // 오늘 일정 — 길찾기 대상 고르기용. 개인정보처리방침상 캘린더 일정은 저장하지 않으므로
  // store(persist)가 아니라 화면 상태로만 들고 있는다.
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const cancelledRef = useRef(false);

  // 캘린더 일정 → 목적 감지, 날씨/타임라인 조회. 최초 마운트와 pull-to-refresh
  // 양쪽에서 재사용한다 — 날씨 API가 실패하고 캐시도 없으면 currentWeather가
  // 계속 null로 남아 "불러오는 중" 문구가 무한히 떠 있었는데, 재시도 수단이
  // 없어서 사용자가 앱을 재시작하는 것 말고는 복구할 방법이 없었음.
  const loadDashboardData = async () => {
    // 초기 state의 weatherLoading 기본값은 false라서, 이 함수가 시작되자마자
    // (캘린더 조회를 기다리는 동안에도) true로 먼저 세팅해둬야 "아직 로딩을 시작하지도
    // 않은 순간"이 "실패"로 잘못 표시되는 걸 막을 수 있다.
    setWeatherLoading(true);

    const events = await CalendarService.getTodayEvents();
    if (cancelledRef.current) return;
    setTodayEvents(events);

    const detectedId = detectPurposeFromEvents(
      events,
      userSettings.departureTime,
      userSettings.customKeywords
    );
    const matchedEvent = detectedId
      ? findMatchingEvent(detectedId, events, userSettings.departureTime, userSettings.customKeywords)
      : null;
    setAutoDetected(detectedId, matchedEvent);

    // 키워드에 안 걸린 일정의 AI 해석 — 기다리지 않는다(AI 연결 설계 4장 규칙 1).
    // 결과는 캐시에 들어가고, 아래 "일정 기반 제안" 카드가 캐시를 읽어 나중에 나타난다.
    // AI가 꺼져 있거나 보낼 제목이 없으면 호출 없이 바로 끝난다.
    AiHintService.precompute(events).catch(() => {});

    const coords = await getCurrentCoords();
    const lat = coords?.lat ?? FALLBACK_LAT;
    const lon = coords?.lon ?? FALLBACK_LON;

    // 기상청 API는 국내 전용 — 좌표 확인이 된 상태에서 명백히 해외라면 API를
    // 호출해봤자 항상 실패(또는 무의미한 값)라서, 조용히 실패하는 대신 이유를
    // 알려주고 조회 자체를 건너뛴다. (위치 조회 실패로 fallback 좌표를 쓴
    // 경우는 이 판정에서 제외 — 그건 별개의 위치 권한 문제)
    if (coords && !isWithinKorea(coords.lat, coords.lon)) {
      setWeatherOutOfArea(true);
      setWeatherLoading(false);
      return;
    }
    setWeatherOutOfArea(false);

    const [weather, timeline] = await Promise.all([
      WeatherService.getCurrentWeather(lat, lon),
      WeatherService.getTimeline(lat, lon),
    ]);
    if (cancelledRef.current) return;
    setWeatherLoading(false);

    if (weather) {
      setWeather({ ...weather, calendarEvents: events });
    }
    setTimeline(timeline);
  };

  useEffect(() => {
    cancelledRef.current = false;

    (async () => {
      await loadDashboardData();
      if (cancelledRef.current) return;

      // 오늘 이미 빌드된 체크리스트가 있으면(=재실행/재오픈) 체크 상태를 보존하고
      // 새로 만들지 않는다. 날짜가 바뀌었거나 최초 실행이면 새로 빌드하고
      // 당일 한정 상태(피드백 등)도 함께 초기화한다.
      if (checklistDate !== getTodayString()) {
        startNewDay();
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  // buildChecklist()는 그동안 목적 수동 선택/영구 루틴 추가 같은 사용자 액션에서만
  // 호출됐다. 그래서 같은 날 안에 날씨가 갱신되거나(pull-to-refresh, 재실행 시 새 예보),
  // 캘린더 기반 자동감지 목적이 바뀌거나, 설정 화면에서 날씨/목적 항목 스위치를 다시
  // 켜도 체크리스트에 반영되지 않는 문제가 있었다. 이 값들이 바뀔 때마다 재빌드해서
  // 항상 최신 상태를 반영하게 한다. 최초 마운트 시 1회는 위 useEffect(마운트 시
  // loadDashboardData+startNewDay)가 이미 처리하므로 건너뛴다.
  const permanentRoutines = useAppStore((s) => s.permanentRoutines);
  const skipRebuildRef = useRef(true);
  useEffect(() => {
    if (skipRebuildRef.current) {
      skipRebuildRef.current = false;
      return;
    }
    buildChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeather, purposeId, userSettings.disabledWeatherItems, userSettings.disabledPurposeItems, permanentRoutines]);

  useEffect(() => {
    // 알림(출발 알림/긴급 알림) 본문을 탭해서 앱을 열었을 때 체크리스트로 스크롤한다.
    // checklistYRef는 체크리스트 카드의 onLayout에서 채워지는데, 콜드스타트 직후에는
    // 아직 레이아웃 측정 전일 수 있어서 한 프레임 미뤄서 실행한다.
    if (!scrollToChecklistRequested) return;

    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: checklistYRef.current, animated: true });
    });
    clearScrollToChecklistRequest();

    return () => cancelAnimationFrame(frame);
  }, [scrollToChecklistRequested, clearScrollToChecklistRequest]);

  const handlePurposeSelect = (id: PurposeId | null) => {
    setPurpose(id);
    buildChecklist();
    scrollRef.current?.scrollTo({ y: checklistYRef.current, animated: true });
  };

  // 실사용 빈도상 "오늘만 추가"가 압도적으로 많을 거라 보고, 매번 "오늘만/매일 루틴"을
  // 고르는 모달 없이 Enter 한 번으로 바로 오늘만 추가되게 한다. 매일 루틴으로 남기고
  // 싶을 때만 입력 중에 나타나는 별도 링크를 쓴다.
  const handleQuickAddToday = () => {
    const trimmed = quickAddText.trim();
    if (!trimmed) return;
    addTempItem(trimmed);
    setQuickAddText('');
  };

  const handleQuickAddPermanent = () => {
    const trimmed = quickAddText.trim();
    if (!trimmed) return;
    addPermanentRoutine(trimmed);
    buildChecklist();
    setQuickAddText('');
  };

  // 음성 인식 결과를 입력창에 실시간 반영하고, 최종 인식 결과가 나오면 바로
  // "오늘만" 추가까지 마친다 — 마이크 버튼 한 번 + 말하기로 손 안 대고 추가 가능.
  const [isListening, setIsListening] = useState(false);

  useSpeechRecognitionEvent('start', () => setIsListening(true));
  useSpeechRecognitionEvent('end', () => setIsListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    setQuickAddText(transcript);
    if (event.isFinal) {
      const trimmed = transcript.trim();
      if (trimmed) {
        addTempItem(trimmed);
        setQuickAddText('');
      }
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    // 'end' 이벤트가 안 오는 플랫폼 케이스에 대비해 여기서도 안전하게 내린다.
    setIsListening(false);
    // 침묵(no-speech/speech-timeout)이나 사용자가 직접 중지(aborted)한 경우는
    // 실패가 아니라 정상 시나리오라 굳이 에러 토스트를 띄우지 않는다.
    if (event.error === 'no-speech' || event.error === 'speech-timeout' || event.error === 'aborted') {
      return;
    }
    showToast('음성 인식에 실패했어요. 다시 시도해주세요.');
  });

  const handleVoiceAdd = async () => {
    if (isListening) {
      // 듣는 중에 마이크를 다시 누르는 건 "그만두겠다"는 뜻이다.
      // stop()은 최종 결과를 확정해서 돌려주는 API라 result 핸들러가 isFinal로
      // 항목을 추가해버린다 — 사용자가 방금 취소한 항목이 목록에 생긴다.
      // 취소에는 결과를 버리는 abort()를 쓴다.
      ExpoSpeechRecognitionModule.abort();
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      showToast('마이크/음성 인식 권한이 필요해요.');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'ko-KR',
      interimResults: true,
      continuous: false,
    });
  };

  // 일정 기반 제안 — 캐시만 읽는다. 일정 제목은 화면 상태(todayEvents)에만 있고 저장되지 않는다.
  const aiSuggestions = aiEnabled
    ? buildSuggestions(
        todayEvents,
        userSettings.customKeywords,
        aiHintCache,
        checklist.map((item) => item.label)
      )
    : [];

  const handleAcceptSuggestion = (suggestion: AiSuggestion) => {
    acceptAiSuggestion(suggestion);
    if (!suggestion.purposeId) return;

    // 방금 추가된 키워드로 목적 자동감지를 다시 돌린다. 사용자가 목적을 직접 고른
    // 상태면 덮어쓰지 않는다 — 자동감지가 수동 선택을 이기면 안 된다.
    showToast(`다음부터 '${suggestion.title}' 일정은 자동으로 인식해요.`);
    if (purposeId !== null && !autoDetected) return;
    const keywords = useAppStore.getState().userSettings.customKeywords;
    const detectedId = detectPurposeFromEvents(todayEvents, userSettings.departureTime, keywords);
    const matchedEvent = detectedId
      ? findMatchingEvent(detectedId, todayEvents, userSettings.departureTime, keywords)
      : null;
    setAutoDetected(detectedId, matchedEvent);
  };

  const handleFeedback = (val: FeedbackType) => {
    applyFeedback(val);
    showToast(FEEDBACK_MESSAGES[val]);
  };

  const total = checklist.length;
  const checkedCount = checklist.filter((i) => i.checked).length;
  const allChecked = total > 0 && checkedCount === total;

  // [떠나기] — 남은 게 있으면 마지막 확인 알림을 띄워 주머니 속에서도 보이게 한다.
  // 결과는 토스트로 바로 알린다. 연타해도 알림이 한 번만 뜨도록 진행 중엔 막는다.
  const [leaving, setLeaving] = useState(false);
  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      const result = await pressLeave();
      if (result.kind === 'all-packed') {
        showToast('다 챙겼어요. 다녀오세요!');
      } else {
        const names = result.unchecked.slice(0, 2).map((i) => i.label).join(', ');
        const more = result.unchecked.length > 2 ? ` 외 ${result.unchecked.length - 2}개` : '';
        showToast(`잠깐! ${names}${more} 아직 안 챙겼어요`);
      }
    } finally {
      setLeaving(false);
    }
  };

  const handleToggleAll = () => {
    if (allChecked) {
      uncheckAll();
    } else {
      checkAll();
    }
  };

  const tier0 = sortSection(checklist.filter((i) => i.tier === 0));
  const tier1 = sortSection(checklist.filter((i) => i.tier === 1));
  const tier2 = sortSection(checklist.filter((i) => i.tier === 2));
  const tier3 = sortSection(checklist.filter((i) => i.tier === 3));

  const activePurposeColor = purposeId ? PurposeColors[PURPOSES[purposeId].color].chip : undefined;

  const perceivedTemp = currentWeather
    ? calcPerceivedTemp(
        currentWeather.temp,
        currentWeather.humidity,
        currentWeather.wind,
        getEffectiveDelta(userSettings.sensitivityLevel, userSettings.learnedDelta)
      )
    : null;

  const perceivedFormula =
    currentWeather && perceivedTemp !== null
      ? formatPerceivedFormula(
          currentWeather.temp,
          currentWeather.humidity,
          currentWeather.wind,
          getEffectiveDelta(userSettings.sensitivityLevel, userSettings.learnedDelta),
          perceivedTemp
        )
      : null;

  const timelineHint = weatherTimeline.length > 0 ? WeatherService.getTimelineHint(weatherTimeline) : null;

  const banners: string[] = [];
  if (currentWeather?.rainAlert) banners.push('오늘 비 예보가 있어요 — 우산을 챙기세요.');
  if (currentWeather?.heatAlert) banners.push('폭염 주의 — 물을 충분히 마시세요.');
  if (autoDetectedEvent) {
    banners.push(`${autoDetectedEvent.time} '${autoDetectedEvent.title}' 일정이 있어요.`);
  }

  const alertTime = getAlertTime(userSettings.departureTime);

  // 렌더마다 현재 시각으로 다시 고른다 — 이미 시작한 일정은 길찾기 대상에서 빠진다.
  const nextPlaceEvent = pickNextPlaceEvent(todayEvents, parseEventTime(new Date().toISOString()));

  const handleOpenDirections = async () => {
    if (!nextPlaceEvent?.location) return;
    const opened = await DirectionsService.openPlace(userSettings.mapApp, nextPlaceEvent.location);
    if (!opened) showToast('지도를 열 수 없어요.');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerWrapper}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>아맞다</Text>
            <Text style={styles.headerSubtitle}>Morning OS</Text>
          </View>
          <Pressable
            style={styles.settingsButton}
            onPress={() => setSettingsVisible((v) => !v)}
            hitSlop={8}
          >
            <Settings size={20} color={Colors.slate600} />
          </Pressable>
        </View>

        <SettingsPanel visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.indigo600} />
        }
      >
        {!statusDismissed ? (
          <View style={styles.statusBar}>
            <View style={styles.statusLeft}>
              <PulseDot />
              <View style={styles.statusTextArea}>
                <Text style={styles.statusLabel}>외출 30분 전</Text>
                <Text style={styles.statusTime}>{userSettings.departureTime}</Text>
              </View>
            </View>
            <Pressable onPress={dismissStatus} hitSlop={8}>
              <X size={18} color={Colors.slate400} />
            </Pressable>
          </View>
        ) : null}

        {nextPlaceEvent ? (
          <View style={styles.placeCard}>
            <MapPin size={16} color={Colors.indigo600} />
            <View style={styles.placeTextArea}>
              <Text style={styles.placeTitle} numberOfLines={1}>
                {nextPlaceEvent.time} · {nextPlaceEvent.title}
              </Text>
              <Text style={styles.placeLocation} numberOfLines={1}>
                {nextPlaceEvent.location}
              </Text>
            </View>
            <Pressable style={styles.placeButton} onPress={handleOpenDirections} hitSlop={8}>
              <Text style={styles.placeButtonText}>길찾기</Text>
            </Pressable>
          </View>
        ) : null}

        <View
          style={[
            styles.curationCard,
            {
              backgroundColor: currentWeather
                ? getCurationBackground(currentWeather.rainAlert, currentWeather.heatAlert)
                : Colors.slate50,
            },
          ]}
        >
          <Text style={styles.curationLocation}>내 위치 날씨</Text>
          <Text style={styles.curationDate}>
            {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
          </Text>

          {currentWeather ? (
            <>
              <Text style={styles.curationWeatherLabel}>{currentWeather.label}</Text>

              {perceivedFormula ? (
                <View style={styles.perceivedBox}>
                  <Text style={styles.perceivedFormula}>{perceivedFormula}</Text>
                  <Text style={styles.perceivedTemp}>{formatTemp(perceivedTemp ?? currentWeather.temp)}</Text>
                </View>
              ) : null}

              {banners.map((banner, i) => (
                <View key={i} style={styles.alertBanner}>
                  <Text style={styles.alertBannerText}>{banner}</Text>
                </View>
              ))}

              <Text style={styles.recommendation}>
                {currentWeather.recommendEmoji} {currentWeather.recommendation}
              </Text>

              {timelineHint ? (
                <View style={[styles.timelineHintBox, { backgroundColor: timelineHint.bg }]}>
                  <Text style={[styles.timelineHintText, { color: timelineHint.color }]}>
                    {timelineHint.text}
                  </Text>
                </View>
              ) : null}

              <View style={styles.feedbackRow}>
                {FEEDBACK_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.val}
                    style={[
                      styles.feedbackChip,
                      todayFeedback === opt.val && styles.feedbackChipActive,
                    ]}
                    onPress={() => handleFeedback(opt.val)}
                  >
                    <Text
                      style={[
                        styles.feedbackChipText,
                        todayFeedback === opt.val && styles.feedbackChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : weatherOutOfArea ? (
            <Text style={styles.loadingText}>
              기상청 API는 국내 전용이에요 — 해외에서는 날씨 정보를 제공할 수 없어요.
            </Text>
          ) : weatherLoading ? (
            <Text style={styles.loadingText}>날씨 정보를 불러오는 중...</Text>
          ) : (
            <View>
              <Text style={styles.loadingText}>날씨 정보를 가져오지 못했어요.</Text>
              <Pressable style={styles.retryButton} onPress={handleRefresh}>
                <Text style={styles.retryButtonText}>다시 시도</Text>
              </Pressable>
            </View>
          )}
        </View>

        {weatherTimeline.length > 0 ? (
          <View style={styles.sectionSpacing}>
            <WeatherTimeline slots={weatherTimeline} currentSlot={getCurrentSlotIndex()} />
          </View>
        ) : null}

        <View style={styles.sectionSpacing}>
          <PurposeSelector
            purposeId={purposeId}
            onSelect={handlePurposeSelect}
            autoDetected={autoDetected}
            autoDetectedEvent={autoDetectedEvent}
          />
        </View>

        <View
          style={[styles.checklistCard, styles.sectionSpacing]}
          onLayout={(e) => {
            checklistYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.checklistHeader}>
            <View style={styles.checklistHeaderLeft}>
              <Text style={styles.checklistTitle}>오늘의 체크리스트</Text>
              <View style={styles.checklistCountBadge}>
                <Text style={styles.checklistCountText}>
                  {checkedCount}/{total}
                </Text>
              </View>
            </View>
            <Pressable onPress={handleToggleAll}>
              <Text style={styles.checklistToggleAll}>{allChecked ? '전체해제' : '모두완료'}</Text>
            </Pressable>
          </View>

          <ProgressBar checked={checkedCount} total={total} />

          {(
            [
              [0, tier0],
              [1, tier1],
              [2, tier2],
              [3, tier3],
            ] as const
          ).map(([tier, items]) =>
            items.length > 0 ? (
              <View key={tier} style={styles.tierSection}>
                <Text style={styles.tierLabel}>{TIER_LABELS[tier]}</Text>
                {items.map((item) => (
                  <ChecklistItem
                    key={item.id}
                    item={item}
                    onToggle={toggleCheck}
                    onDelete={deleteItem}
                    purposeColor={activePurposeColor}
                  />
                ))}
              </View>
            ) : null
          )}

          <View style={styles.quickAddRow}>
            <TextInput
              style={styles.quickAddInput}
              value={quickAddText}
              onChangeText={setQuickAddText}
              placeholder="더 챙길 것이 있나요? 오늘만 추가하기..."
              placeholderTextColor={Colors.slate400}
              onSubmitEditing={handleQuickAddToday}
              returnKeyType="done"
              submitBehavior="submit"
            />
            <Pressable
              style={[styles.micButton, isListening && styles.micButtonActive]}
              onPress={handleVoiceAdd}
              hitSlop={8}
            >
              <Mic size={18} color={isListening ? Colors.white : Colors.slate500} />
            </Pressable>
          </View>

          {quickAddText.trim() ? (
            <Pressable onPress={handleQuickAddPermanent} hitSlop={8}>
              <Text style={styles.quickAddPermanentLink}>📌 매일 루틴으로 추가</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={({ pressed }) => [styles.leaveButton, styles.sectionSpacing, pressed && styles.leaveButtonPressed]}
          onPress={handleLeave}
          disabled={leaving}
          accessibilityRole="button"
          accessibilityLabel="떠나기 — 나가기 전에 남은 것 확인"
        >
          <Text style={styles.leaveButtonText}>떠나기</Text>
          <Text style={styles.leaveButtonSub}>
            {allChecked ? '다 챙겼어요' : `아직 ${total - checkedCount}개 남음`}
          </Text>
        </Pressable>

        {aiSuggestions.length > 0 ? (
          <View style={styles.sectionSpacing}>
            <AiSuggestionCard
              suggestions={aiSuggestions}
              onAccept={handleAcceptSuggestion}
              onReject={(s) => rejectAiSuggestion(s.key)}
            />
          </View>
        ) : null}

        {currentWeather ? (
          <View style={[styles.envStrip, styles.sectionSpacing]}>
            <View style={styles.envCell}>
              <CloudFog size={18} color={Colors.slate500} />
              <Text style={styles.envValue}>{currentWeather.dustLevel}</Text>
              <Text style={styles.envLabel}>미세먼지</Text>
            </View>
            <View style={styles.envCell}>
              <Droplets size={18} color={Colors.slate500} />
              <Text style={styles.envValue}>{currentWeather.humidity}%</Text>
              <Text style={styles.envLabel}>습도</Text>
            </View>
            <View style={styles.envCell}>
              <Wind size={18} color={Colors.slate500} />
              <Text style={styles.envValue}>{currentWeather.wind}m/s</Text>
              <Text style={styles.envLabel}>바람</Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.notificationPreview, styles.sectionSpacing]}>
          <Text style={styles.notificationTitle}>알림 미리보기</Text>
          <View style={styles.notificationRow}>
            <Text style={styles.notificationStep}>1단계 · 전날 22:00</Text>
            <Text style={styles.notificationText}>내일 날씨 예보를 확인해보세요.</Text>
          </View>
          <View style={styles.notificationRow}>
            <Text style={styles.notificationStep}>2단계 · 당일 {alertTime}</Text>
            <Text style={styles.notificationText}>외출 30분 전이에요. 체크리스트를 확인하세요.</Text>
          </View>
          <View style={styles.notificationRow}>
            <Text style={styles.notificationStep}>3단계 · 현관 이탈 감지</Text>
            <Text style={styles.notificationText}>오늘 착장은 어땠나요? 피드백을 남겨주세요.</Text>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {toast ? <Toast message={toast} onDone={clearToast} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bgDefault,
  },
  headerWrapper: {
    position: 'relative',
    zIndex: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: Colors.bgDefault,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.indigo600,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.slate400,
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: Colors.slate800,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulseWrapper: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  pulseDotCore: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.emerald500,
  },
  pulseDotRing: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.emerald500,
  },
  statusTextArea: {},
  statusLabel: {
    fontSize: 11,
    color: Colors.slate500,
  },
  statusTime: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.slate800,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    shadowColor: Colors.slate800,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  placeTextArea: {
    flex: 1,
  },
  placeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.slate800,
  },
  placeLocation: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.slate500,
  },
  placeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 50,
    backgroundColor: Colors.indigo50,
  },
  placeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.indigo600,
  },
  curationCard: {
    borderRadius: 20,
    padding: 18,
  },
  curationLocation: {
    fontSize: 12,
    color: Colors.slate500,
  },
  curationDate: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.slate400,
  },
  curationWeatherLabel: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.slate800,
  },
  perceivedBox: {
    marginTop: 12,
    alignItems: 'flex-start',
  },
  perceivedFormula: {
    fontSize: 11,
    color: Colors.slate500,
  },
  perceivedTemp: {
    marginTop: 4,
    fontSize: 36,
    fontWeight: '800',
    color: Colors.slate800,
  },
  alertBanner: {
    marginTop: 10,
    backgroundColor: Colors.white,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  alertBannerText: {
    fontSize: 12,
    color: Colors.slate600,
    fontWeight: '500',
  },
  recommendation: {
    marginTop: 14,
    fontSize: 14,
    color: Colors.slate700,
  },
  timelineHintBox: {
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  timelineHintText: {
    fontSize: 12,
    fontWeight: '500',
  },
  feedbackRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  feedbackChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  feedbackChipActive: {
    backgroundColor: Colors.indigo600,
  },
  feedbackChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.slate600,
  },
  feedbackChipTextActive: {
    color: Colors.white,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 13,
    color: Colors.slate400,
  },
  retryButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 50,
    backgroundColor: Colors.white,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.indigo600,
  },
  sectionSpacing: {
    marginTop: 16,
  },
  checklistCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 18,
  },
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  checklistHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checklistTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.slate800,
  },
  checklistCountBadge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 50,
    backgroundColor: Colors.indigo50,
  },
  checklistCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.indigo600,
  },
  checklistToggleAll: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.indigo600,
  },
  tierSection: {
    marginTop: 14,
  },
  tierLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.slate400,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  quickAddRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickAddInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.slate200,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 13,
    color: Colors.slate800,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.slate100,
  },
  micButtonActive: {
    backgroundColor: Colors.indigo600,
  },
  leaveButton: {
    backgroundColor: Colors.indigo600,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  leaveButtonPressed: {
    opacity: 0.85,
  },
  leaveButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.white,
  },
  leaveButtonSub: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.indigo100,
  },
  quickAddPermanentLink: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.indigo600,
  },
  envStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
  },
  envCell: {
    flex: 1,
    alignItems: 'center',
  },
  envValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.slate800,
  },
  envLabel: {
    marginTop: 2,
    fontSize: 11,
    color: Colors.slate400,
  },
  notificationPreview: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
  },
  notificationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.slate800,
    marginBottom: 10,
  },
  notificationRow: {
    marginBottom: 8,
  },
  notificationStep: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.indigo600,
  },
  notificationText: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.slate600,
  },
  bottomSpacer: {
    height: 120,
  },
});
