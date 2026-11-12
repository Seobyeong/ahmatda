import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
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
  Plus,
  Settings,
  Wind,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { calcPerceivedTemp, formatPerceivedFormula, formatTemp, getEffectiveDelta, getExposureAdjust } from '../utils/temperature';
import { getAlertTime, getCurrentSlotIndex, getDepartureCountdown, getFeedbackOutingDate, getTodayString, parseEventTime } from '../utils/time';
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
import { leaveResultMessage, pressLeave } from '../services/departure/leave';
import { TomorrowPreviewModal } from '../components/TomorrowPreviewModal';
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

const TIERS = [0, 1, 2, 3] as const;

// 앱을 다시 볼 때 날씨·일정이 이보다 오래됐으면 새로 받는다.
const DATA_STALE_MS = 30 * 60 * 1000;
// 자동 새로고침이 실패했거나 아직 안 끝났을 때 다시 시도하기까지의 간격
const AUTO_RETRY_MS = 2 * 60 * 1000;
// 남은 시간 표시와 날짜 바뀜 확인 주기 (화면이 보일 때만 돈다)
const CLOCK_TICK_MS = 30 * 1000;

// 분류별로 나누고, 각 분류 안에서는 안 챙긴 것을 위로 올린다 (정렬은 안정적이라 원래 순서 유지).
function groupByTier(checklist: ChecklistItemType[]) {
  return TIERS.map((tier) => ({
    tier,
    items: checklist
      .filter((item) => item.tier === tier)
      .sort((a, b) => Number(a.checked) - Number(b.checked)),
  })).filter((section) => section.items.length > 0);
}

function getCurationBackground(rainAlert: boolean, heatAlert: boolean): string {
  if (rainAlert) return Colors.sky50;
  if (heatAlert) return Colors.orange50;
  return Colors.indigo50;
}

function PulseDot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    // 기기에서 "동작 줄이기"를 켠 사람에게는 계속 깜빡이는 점을 멈춘다.
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled || reduce) return;
        loop = createPulse(scale, opacity);
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [scale, opacity]);

  return (
    <View style={styles.pulseWrapper}>
      <View style={[styles.pulseDotCore, { backgroundColor: color }]} />
      <Animated.View
        style={[styles.pulseDotRing, { backgroundColor: color, opacity, transform: [{ scale }] }]}
      />
    </View>
  );
}

function createPulse(scale: Animated.Value, opacity: Animated.Value) {
  return Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.8, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.delay(600),
        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
      ])
    );
}

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const checklistYRef = useRef(0);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [quickAddText, setQuickAddText] = useState('');

  const checklist = useAppStore((s) => s.checklist);
  const purposeId = useAppStore((s) => s.purposeId);
  const autoDetected = useAppStore((s) => s.autoDetected);
  const autoDetectedEvent = useAppStore((s) => s.autoDetectedEvent);
  const currentWeather = useAppStore((s) => s.currentWeather);
  const weatherLoading = useAppStore((s) => s.weatherLoading);
  const weatherOutOfArea = useAppStore((s) => s.weatherOutOfArea);
  const weatherTimeline = useAppStore((s) => s.weatherTimeline);
  const userSettings = useAppStore((s) => s.userSettings);
  // 선택 표시는 store가 피드백을 붙이는 "가장 최근 외출" 기준 — 자기 전 정리 알림으로
  // 이미 답했으면 앱에서도 켜져 보여야 같은 외출에 두 번 답하지 않는다.
  const feedbackHistory = useAppStore((s) => s.feedbackHistory);
  const currentFeedback =
    feedbackHistory.find((r) => r.date === getFeedbackOutingDate(userSettings.departureTime))?.val ?? null;
  const statusDismissed = useAppStore((s) => s.statusDismissed);
  const toast = useAppStore((s) => s.toast);
  const toastAction = useAppStore((s) => s.toastAction);
  const scrollToChecklistRequested = useAppStore((s) => s.scrollToChecklistRequested);
  const tomorrowPreviewRequested = useAppStore((s) => s.tomorrowPreviewRequested);
  const clearTomorrowPreviewRequest = useAppStore((s) => s.clearTomorrowPreviewRequest);
  const [tomorrowVisible, setTomorrowVisible] = useState(false);
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
  const lastLoadedAtRef = useRef(0);   // 마지막으로 성공한 시각
  const lastAttemptAtRef = useRef(0);  // 마지막으로 시도한 시각 (성공 여부와 무관)
  const loadSeqRef = useRef(0);
  // 남은 시간 표시·길찾기 대상 고르기에 쓰는 "지금". 30초마다 갱신한다.
  const [now, setNow] = useState(() => new Date());

  // 캘린더 일정 → 목적 감지, 날씨/타임라인 조회. 최초 마운트와 pull-to-refresh
  // 양쪽에서 재사용한다 — 날씨 API가 실패하고 캐시도 없으면 currentWeather가
  // 계속 null로 남아 "불러오는 중" 문구가 무한히 떠 있었는데, 재시도 수단이
  // 없어서 사용자가 앱을 재시작하는 것 말고는 복구할 방법이 없었음.
  const loadDashboardData = async () => {
    // 초기 state의 weatherLoading 기본값은 false라서, 이 함수가 시작되자마자
    // (캘린더 조회를 기다리는 동안에도) true로 먼저 세팅해둬야 "아직 로딩을 시작하지도
    // 않은 순간"이 "실패"로 잘못 표시되는 걸 막을 수 있다.
    setWeatherLoading(true);
    lastAttemptAtRef.current = Date.now();

    // 여러 번 겹쳐 돌 수 있다(앱 복귀 + 당겨서 새로고침). 나중에 시작한 것만 화면에 반영한다 —
    // 하나만 돌게 막으면 위치 조회가 멈췄을 때 "다시 시도"까지 같이 막힌다.
    const seq = ++loadSeqRef.current;
    const superseded = () => cancelledRef.current || seq !== loadSeqRef.current;

    // 위치 조회는 일정과 같이 시작만 해 둔다. 일정·목적 감지는 위치를 기다리지 않는다 —
    // 아침엔 새 위치를 잡는 데 몇 초씩 걸린다.
    const coordsPromise = getCurrentCoords().catch(() => null);
    const events = await CalendarService.getTodayEvents();
    if (superseded()) return;
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

    const coords = await coordsPromise;
    if (superseded()) return;
    const lat = coords?.lat ?? FALLBACK_LAT;
    const lon = coords?.lon ?? FALLBACK_LON;

    // 기상청 API는 국내 전용 — 좌표 확인이 된 상태에서 명백히 해외라면 API를
    // 호출해봤자 항상 실패(또는 무의미한 값)라서, 조용히 실패하는 대신 이유를
    // 알려주고 조회 자체를 건너뛴다. (위치 조회 실패로 fallback 좌표를 쓴
    // 경우는 이 판정에서 제외 — 그건 별개의 위치 권한 문제)
    if (coords && !isWithinKorea(coords.lat, coords.lon)) {
      setWeatherOutOfArea(true);
      setWeatherLoading(false);
      lastLoadedAtRef.current = Date.now();
      return;
    }
    setWeatherOutOfArea(false);

    const [weather, timeline] = await Promise.all([
      WeatherService.getCurrentWeather(lat, lon),
      WeatherService.getTimeline(lat, lon),
    ]);
    if (superseded()) return;
    setWeatherLoading(false);

    if (weather) {
      setWeather({ ...weather, calendarEvents: events });
      // 성공했을 때만 찍는다 — 시작할 때 찍으면 지하철에서 실패한 뒤 30분 동안 다시 받지 않는다.
      lastLoadedAtRef.current = Date.now();
    }
    setTimeline(timeline);
  };

  // effect는 한 번만 걸고, 그 안에서는 항상 최신 설정을 쓰는 함수를 부른다.
  const refreshDataRef = useRef(loadDashboardData);
  refreshDataRef.current = loadDashboardData;

  useEffect(() => {
    cancelledRef.current = false;

    // 오늘 이미 빌드된 체크리스트가 있으면(=재실행/재오픈) 체크 상태를 보존하고
    // 새로 만들지 않는다. 날짜가 바뀌었거나 최초 실행이면 새로 빌드하고
    // 당일 한정 상태(피드백 등)도 함께 초기화한다. 날씨를 기다리지 않고 먼저 한다 —
    // 기다리는 동안 어제 목록이 보이면 안 되고, 날씨 항목은 도착하는 대로 아래 effect가 더한다.
    const rollOverIfNewDay = () => {
      if (useAppStore.getState().checklistDate === getTodayString()) return false;
      startNewDay();
      setTodayEvents([]); // 어제 일정으로 길찾기 카드가 뜨지 않게
      return true;
    };

    rollOverIfNewDay();
    refreshDataRef.current();

    // 앱을 끄지 않고 다음 날 아침에 다시 여는 게 보통이다. 예전엔 처음 켤 때만 날짜를 봐서,
    // 켜 둔 채 밤을 넘기면 어제 체크·어제 날씨가 그대로 남았다. 화면으로 돌아올 때와
    // 보고 있는 동안 주기적으로 확인한다.
    const sync = () => {
      setNow(new Date());
      const rolled = rollOverIfNewDay();
      const stale = Date.now() - lastLoadedAtRef.current > DATA_STALE_MS;
      const canRetry = Date.now() - lastAttemptAtRef.current > AUTO_RETRY_MS;
      if (rolled || (stale && canRetry)) refreshDataRef.current();
    };
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') sync();
    }, CLOCK_TICK_MS);

    return () => {
      cancelledRef.current = true;
      appStateSub.remove();
      clearInterval(timer);
    };
  }, [startNewDay]);

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
    // weatherTimeline: 우산은 남은 시간대 예보로도 판단한다 (isRainExpectedToday)
    // commuteMode: 자차면 우산 기준이 달라진다
  }, [currentWeather, weatherTimeline, purposeId, userSettings.disabledWeatherItems, userSettings.disabledPurposeItems, userSettings.commuteMode, permanentRoutines]);

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

  // 자기 전 정리 알림을 눌러 들어온 경우 — 다음 외출 준비 화면을 연다
  useEffect(() => {
    if (!tomorrowPreviewRequested) return;
    setTomorrowVisible(true);
    clearTomorrowPreviewRequest();
  }, [tomorrowPreviewRequested, clearTomorrowPreviewRequest]);

  const handlePurposeSelect = (id: PurposeId | null) => {
    setPurpose(id);
    buildChecklist();
    scrollRef.current?.scrollTo({ y: checklistYRef.current, animated: true });
  };

  // 실사용 빈도상 "오늘만 추가"가 압도적으로 많을 거라 보고, 매번 "오늘만/매일 루틴"을
  // 고르는 모달 없이 Enter 한 번으로 바로 오늘만 추가되게 한다. 매일 루틴으로 남기고
  // 싶을 때만 입력 중에 나타나는 별도 링크를 쓴다.
  const addToday = (label: string) => {
    if (!addTempItem(label)) showToast(`'${label}'은(는) 이미 목록에 있어요.`);
  };

  const handleQuickAddToday = () => {
    const trimmed = quickAddText.trim();
    if (!trimmed) return;
    addToday(trimmed);
    setQuickAddText('');
  };

  const handleQuickAddPermanent = () => {
    const trimmed = quickAddText.trim();
    if (!trimmed) return;
    if (addPermanentRoutine(trimmed)) {
      buildChecklist();
      showToast(`'${trimmed}'을(를) 매일 루틴에 넣었어요.`);
    } else {
      showToast(`'${trimmed}'은(는) 이미 루틴에 있어요.`);
    }
    setQuickAddText('');
  };

  // ✕는 체크 바로 옆이고, 루틴은 한 번에 영구 삭제된다(날씨·목적 항목은 영구 꺼짐).
  // 잘못 눌러도 돌이킬 수 있게 되돌리기를 붙인다.
  const handleDeleteItem = useCallback(
    (id: string) => {
      const item = useAppStore.getState().checklist.find((i) => i.id === id);
      const undo = deleteItem(id);
      if (!item || !undo) return;
      const message = item.temp
        ? `'${item.label}'을(를) 지웠어요.`
        : item.permanent
          ? `'${item.label}'을(를) 루틴에서 지웠어요.`
          : `'${item.label}'은(는) 이제 추천하지 않아요.`;
      showToast(message, { label: '되돌리기', onPress: undo });
    },
    [deleteItem, showToast]
  );

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
        addToday(trimmed);
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
  const aiSuggestions = useMemo(
    () =>
      aiEnabled
        ? buildSuggestions(
            todayEvents,
            userSettings.customKeywords,
            aiHintCache,
            checklist.map((item) => item.label)
          )
        : [],
    [aiEnabled, todayEvents, userSettings.customKeywords, aiHintCache, checklist]
  );

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
      showToast(leaveResultMessage(await pressLeave()));
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

  // 입력창에 글자를 칠 때마다(quickAddText) 화면이 다시 그려지는데, 그때마다 목록을
  // 다시 나누고 정렬할 필요는 없다.
  const tierSections = useMemo(() => groupByTier(checklist), [checklist]);

  const activePurposeColor = purposeId ? PurposeColors[PURPOSES[purposeId].color].chip : undefined;

  const basePerceived = currentWeather
    ? calcPerceivedTemp(
        currentWeather.temp,
        currentWeather.humidity,
        currentWeather.wind,
        getEffectiveDelta(userSettings.sensitivityLevel, userSettings.learnedDelta)
      )
    : null;
  const exposureAdj = basePerceived !== null ? getExposureAdjust(basePerceived, userSettings.commuteMode) : 0;
  const perceivedTemp = basePerceived !== null ? basePerceived + exposureAdj : null;

  const perceivedFormula =
    currentWeather && perceivedTemp !== null
      ? formatPerceivedFormula(
          currentWeather.temp,
          currentWeather.humidity,
          currentWeather.wind,
          getEffectiveDelta(userSettings.sensitivityLevel, userSettings.learnedDelta),
          perceivedTemp,
          exposureAdj
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
  const countdown = getDepartureCountdown(userSettings.departureTime, now);
  const todayLabel = now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  // 현재 시각으로 다시 고른다 — 이미 시작한 일정은 길찾기 대상에서 빠진다.
  const nextPlaceEvent = pickNextPlaceEvent(todayEvents, parseEventTime(now.toISOString()));

  const handleOpenDirections = async () => {
    if (!nextPlaceEvent?.location) return;
    const opened = await DirectionsService.openPlace(userSettings.mapApp, nextPlaceEvent.location);
    if (!opened) showToast('지도를 열 수 없어요.');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerWrapper} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        {/* 상태바·노치 높이는 기기마다 달라서 고정값 대신 안전 영역을 쓴다 */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View>
            <Text style={styles.headerTitle} accessibilityRole="header">아맞다</Text>
            <Text style={styles.headerSubtitle}>{todayLabel}</Text>
          </View>
          <Pressable
            style={styles.settingsButton}
            onPress={() => setSettingsVisible((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={settingsVisible ? '설정 닫기' : '설정 열기'}
          >
            <Settings size={22} color={Colors.slate600} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        // 키보드가 떠 있을 때도 첫 탭이 바로 먹게 — 없으면 "매일 루틴으로 추가"나 체크박스를
        // 누른 첫 탭이 키보드만 내리고 사라진다.
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.indigo600} />
        }
      >
        {!statusDismissed ? (
          <View style={[styles.statusBar, countdown.soon && styles.statusBarSoon]}>
            <View
              style={styles.statusLeft}
              accessible
              accessibilityLabel={[countdown.label, countdown.value, countdown.detail].filter(Boolean).join(', ')}
            >
              <PulseDot color={countdown.soon ? Colors.amber500 : Colors.emerald500} />
              <View>
                <Text style={[styles.statusLabel, countdown.soon && styles.statusLabelSoon]}>{countdown.label}</Text>
                <View style={styles.statusValueRow}>
                  <Text style={styles.statusTime}>{countdown.value}</Text>
                  {countdown.detail ? <Text style={styles.statusDetail}>{countdown.detail}</Text> : null}
                </View>
              </View>
            </View>
            <Pressable
              style={styles.iconButton}
              onPress={dismissStatus}
              accessibilityRole="button"
              accessibilityLabel="외출 시간 안내 닫기"
            >
              <X size={18} color={Colors.slate500} />
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
            <Pressable
              style={styles.placeButton}
              onPress={handleOpenDirections}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${nextPlaceEvent.title} 길찾기`}
            >
              <Text style={styles.placeButtonText}>길찾기</Text>
            </Pressable>
          </View>
        ) : null}

        <View
          style={[
            styles.curationCard,
            {
              // 날씨가 없을 때도 카드로 보이게 흰색 — 화면 배경과 같은 색이면 글자만 떠 보인다.
              backgroundColor: currentWeather
                ? getCurationBackground(currentWeather.rainAlert, currentWeather.heatAlert)
                : Colors.white,
            },
          ]}
        >
          <Text style={styles.curationLocation}>내 위치 날씨</Text>

          {currentWeather ? (
            <>
              <Text style={styles.curationWeatherLabel}>{currentWeather.label}</Text>

              {perceivedFormula ? (
                <View
                  style={styles.perceivedBox}
                  accessible
                  accessibilityLabel={`나에게 맞춘 체감온도 ${formatTemp(perceivedTemp ?? currentWeather.temp)}`}
                >
                  <Text style={styles.perceivedCaption}>나에게 맞춘 체감온도</Text>
                  <Text style={styles.perceivedTemp}>{formatTemp(perceivedTemp ?? currentWeather.temp)}</Text>
                  <Text style={styles.perceivedFormula}>{perceivedFormula}</Text>
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

              {/* 버튼만 있으면 무엇을 묻는지 알 수 없다 — 무엇에 대한 답이고 왜 묻는지 한 줄로 알린다. */}
              <Text style={styles.feedbackCaption}>
                최근 외출 때 옷차림은 어땠나요? 답할수록 체감온도가 나에게 맞춰져요.
              </Text>
              <View style={styles.feedbackRow} accessibilityRole="radiogroup">
                {FEEDBACK_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.val}
                    style={[
                      styles.feedbackChip,
                      currentFeedback === opt.val && styles.feedbackChipActive,
                    ]}
                    onPress={() => handleFeedback(opt.val)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: currentFeedback === opt.val }}
                    accessibilityLabel={`옷차림 ${opt.label}`}
                  >
                    <Text
                      style={[
                        styles.feedbackChipText,
                        currentFeedback === opt.val && styles.feedbackChipTextActive,
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
              <Pressable style={styles.retryButton} onPress={handleRefresh} accessibilityRole="button">
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
              <Text style={styles.checklistTitle} accessibilityRole="header">오늘의 체크리스트</Text>
              <View
                style={[styles.checklistCountBadge, allChecked && styles.checklistCountBadgeDone]}
                accessible
                accessibilityLabel={`${total}개 중 ${checkedCount}개 챙김`}
              >
                <Text style={[styles.checklistCountText, allChecked && styles.checklistCountTextDone]}>
                  {checkedCount}/{total}
                </Text>
              </View>
            </View>
            {total > 0 ? (
              <Pressable onPress={handleToggleAll} hitSlop={12} accessibilityRole="button">
                <Text style={styles.checklistToggleAll}>{allChecked ? '전체 해제' : '모두 챙김'}</Text>
              </Pressable>
            ) : null}
          </View>

          <ProgressBar checked={checkedCount} total={total} />

          {total === 0 ? (
            <Text style={styles.emptyChecklist}>
              오늘 챙길 것이 아직 없어요. 위에서 목적을 고르거나 아래에 직접 추가해 보세요.
            </Text>
          ) : null}

          {tierSections.map(({ tier, items }) => (
            <View key={tier} style={styles.tierSection}>
              <Text style={styles.tierLabel}>{TIER_LABELS[tier]}</Text>
              {items.map((item) => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  onToggle={toggleCheck}
                  onDelete={handleDeleteItem}
                  purposeColor={activePurposeColor}
                />
              ))}
            </View>
          ))}

          <View style={styles.quickAddRow}>
            <TextInput
              style={styles.quickAddInput}
              value={quickAddText}
              onChangeText={setQuickAddText}
              placeholder={isListening ? '듣고 있어요…' : '오늘만 챙길 것 추가'}
              placeholderTextColor={Colors.slate500}
              onSubmitEditing={handleQuickAddToday}
              returnKeyType="done"
              submitBehavior="submit"
              maxLength={40}
              accessibilityLabel="오늘만 챙길 것 추가"
            />
            {/* 글자를 치면 마이크 자리가 추가 버튼이 된다. 예전엔 키보드의 완료 키로만 넣을 수 있어서
                넣는 방법이 화면에 보이지 않았다. */}
            {quickAddText.trim() && !isListening ? (
              <Pressable
                style={[styles.micButton, styles.micButtonActive]}
                onPress={handleQuickAddToday}
                accessibilityRole="button"
                accessibilityLabel={`${quickAddText.trim()} 오늘만 추가`}
              >
                <Plus size={20} color={Colors.white} />
              </Pressable>
            ) : (
              <Pressable
                style={[styles.micButton, isListening && styles.micButtonActive]}
                onPress={handleVoiceAdd}
                accessibilityRole="button"
                accessibilityLabel={isListening ? '음성 입력 취소' : '음성으로 추가'}
              >
                <Mic size={20} color={isListening ? Colors.white : Colors.slate600} />
              </Pressable>
            )}
          </View>

          {quickAddText.trim() && !isListening ? (
            <Pressable
              style={styles.quickAddPermanentButton}
              onPress={handleQuickAddPermanent}
              accessibilityRole="button"
              accessibilityLabel={`${quickAddText.trim()} 매일 루틴으로 추가`}
            >
              <Text style={styles.quickAddPermanentLink}>📌 오늘만이 아니라 매일 루틴으로 추가</Text>
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

        <Pressable
          style={[styles.tomorrowButton, styles.sectionSpacing]}
          onPress={() => setTomorrowVisible(true)}
          accessibilityRole="button"
        >
          <Text style={styles.tomorrowButtonText}>🌙 다음 외출 준비 미리보기</Text>
          <Text style={styles.tomorrowButtonSub}>그날 일정·예보로 뜰 것을 보고, 그날만 챙길 것을 더해요</Text>
        </Pressable>

        <View style={[styles.notificationPreview, styles.sectionSpacing]}>
          <Text style={styles.notificationTitle}>알림 미리보기</Text>
          {userSettings.alertPreference !== 'minimal' ? (
            <View style={styles.notificationRow}>
              <Text style={styles.notificationStep}>출발 30분 전 · {alertTime}</Text>
              <Text style={styles.notificationText}>잠금화면에 체크리스트가 떠요. 나갈 땐 [떠나기]를 눌러 마지막 확인.</Text>
            </View>
          ) : null}
          <View style={styles.notificationRow}>
            <Text style={styles.notificationStep}>현관 이탈 감지</Text>
            <Text style={styles.notificationText}>안 챙긴 채 나가면 바로 알려요.</Text>
          </View>
          <View style={styles.notificationRow}>
            <Text style={styles.notificationStep}>자기 전 정리 · {userSettings.nightlyCheckTime}</Text>
            <Text style={styles.notificationText}>오늘 착장 피드백을 남기고 다음 외출 준비를 봐요.</Text>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* 헤더 안에 두고 top:'100%'로 띄우면 패널이 부모 영역 밖에 놓여, Android에서
          탭은 되지만 패널 안 스크롤 제스처가 뒤의 대시보드로 가버린다. 화면 직속으로 둔다. */}
      <SettingsPanel top={headerHeight} visible={settingsVisible} onClose={() => setSettingsVisible(false)} />

      <TomorrowPreviewModal visible={tomorrowVisible} onClose={() => setTomorrowVisible(false)} />

      {toast ? <Toast message={toast} action={toastAction} onDone={clearToast} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bgDefault,
  },
  headerWrapper: {
    zIndex: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
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
    fontSize: 13,
    color: Colors.slate500,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  statusBarSoon: {
    backgroundColor: Colors.amber50,
  },
  statusLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabelSoon: {
    color: Colors.amber700,
    fontWeight: '700',
  },
  statusValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  statusDetail: {
    fontSize: 13,
    color: Colors.slate500,
  },
  // 아이콘만 있는 버튼의 공통 터치 영역 (44×44)
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
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
  },
  pulseDotRing: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 12,
    color: Colors.slate500,
  },
  statusTime: {
    fontSize: 20,
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
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 50,
    backgroundColor: Colors.indigo50,
  },
  placeButtonText: {
    fontSize: 13,
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
  perceivedCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.slate600,
  },
  perceivedTemp: {
    marginTop: 2,
    fontSize: 40,
    fontWeight: '800',
    color: Colors.slate800,
  },
  // 계산 근거 — 큰 숫자 아래에 두어 "무엇"을 먼저, "왜"를 나중에 읽게 한다.
  perceivedFormula: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.slate500,
  },
  alertBanner: {
    marginTop: 10,
    backgroundColor: Colors.white,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  alertBannerText: {
    fontSize: 13,
    color: Colors.slate700,
    fontWeight: '600',
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
    fontSize: 13,
    fontWeight: '500',
  },
  feedbackCaption: {
    marginTop: 18,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.slate600,
  },
  feedbackRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  feedbackChip: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  feedbackChipActive: {
    backgroundColor: Colors.indigo600,
  },
  feedbackChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.slate600,
  },
  feedbackChipTextActive: {
    color: Colors.white,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.slate500,
  },
  retryButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 50,
    backgroundColor: Colors.indigo50,
  },
  retryButtonText: {
    fontSize: 14,
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
    fontSize: 17,
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
    fontSize: 12,
    fontWeight: '700',
    color: Colors.indigo600,
  },
  checklistCountBadgeDone: {
    backgroundColor: Colors.emerald50,
  },
  checklistCountTextDone: {
    color: Colors.emerald600,
  },
  checklistToggleAll: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.indigo600,
  },
  emptyChecklist: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.slate500,
  },
  tierSection: {
    marginTop: 14,
  },
  tierLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.slate500,
    marginBottom: 2,
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
    minHeight: 46,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.slate800,
  },
  micButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.slate100,
  },
  micButtonActive: {
    backgroundColor: Colors.indigo600,
  },
  tomorrowButton: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
  },
  tomorrowButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.slate800,
  },
  tomorrowButtonSub: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.slate500,
  },
  leaveButton: {
    backgroundColor: Colors.indigo600,
    borderRadius: 16,
    paddingVertical: 16,
    minHeight: 64,
    justifyContent: 'center',
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
    fontSize: 13,
    color: Colors.indigo100,
  },
  quickAddPermanentButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    marginTop: 4,
  },
  quickAddPermanentLink: {
    fontSize: 13,
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
    fontSize: 12,
    color: Colors.slate500,
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
    fontSize: 12,
    fontWeight: '600',
    color: Colors.indigo600,
  },
  notificationText: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.slate600,
  },
  bottomSpacer: {
    height: 120,
  },
});
