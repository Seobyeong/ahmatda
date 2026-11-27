import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { detectPurposeFromEvents, findMatchingEvent, untaggedEvents } from '../../constants/purposes';
import { scheduleOf, taggedPurposes, useAppStore } from '../../store';
import { referenceTimeOn } from '../../utils/schedule';
import { AiHintService } from '../../services/ai/AiHintService';
import { CalendarService } from '../../services/calendar/CalendarService';
import { WeatherService } from '../../services/weather/WeatherService';
import { isWithinKorea } from '../../utils/kmaGrid';
import { getCurrentCoords } from '../../utils/location';
import { getTodayString } from '../../utils/time';
import type { CalendarEvent } from '../../types';

// 위치 권한이 없거나 좌표 조회에 실패했을 때만 쓰이는 폴백 좌표 (서울시청)
const FALLBACK_LAT = 37.5665;
const FALLBACK_LON = 126.978;

// 앱을 다시 볼 때 날씨·일정이 이보다 오래됐으면 새로 받는다.
const DATA_STALE_MS = 30 * 60 * 1000;
// 자동 새로고침이 실패했거나 아직 안 끝났을 때 다시 시도하기까지의 간격
const AUTO_RETRY_MS = 2 * 60 * 1000;
// 남은 시간 표시와 날짜 바뀜 확인 주기 (화면이 보일 때만 돈다)
const CLOCK_TICK_MS = 30 * 1000;

// 대시보드가 보여 줄 바깥 정보(일정·날씨)를 불러오고, 날짜가 바뀌면 하루를 넘기고,
// 조건이 바뀔 때마다 체크리스트를 다시 조립한다. 화면은 결과만 받아 그린다.
export function useDashboardData() {
  const userSettings = useAppStore((s) => s.userSettings);
  const currentWeather = useAppStore((s) => s.currentWeather);
  const weatherTimeline = useAppStore((s) => s.weatherTimeline);
  const purposeId = useAppStore((s) => s.purposeId);
  const permanentRoutines = useAppStore((s) => s.permanentRoutines);

  const setAutoDetected = useAppStore((s) => s.setAutoDetected);
  const setWeather = useAppStore((s) => s.setWeather);
  const setTimeline = useAppStore((s) => s.setTimeline);
  const setWeatherLoading = useAppStore((s) => s.setWeatherLoading);
  const setWeatherOutOfArea = useAppStore((s) => s.setWeatherOutOfArea);
  const buildChecklist = useAppStore((s) => s.buildChecklist);
  const startNewDay = useAppStore((s) => s.startNewDay);

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
  // 위치를 못 잡아 서울시청 좌표로 날씨를 받았는지 — 날씨 블록이 "내 위치" 대신 "서울"이라고 쓴다.
  const [usingFallbackLocation, setUsingFallbackLocation] = useState(false);

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

    // 오늘 외출 시간 기준으로 일정을 맞춘다 (쉬는 날이면 기본 시간).
    const refTime = referenceTimeOn(new Date(), scheduleOf(useAppStore.getState()));
    const tagged = taggedPurposes(useAppStore.getState());
    const detectedId = detectPurposeFromEvents(events, refTime, userSettings.customKeywords, tagged);
    const matchedEvent = detectedId
      ? findMatchingEvent(detectedId, events, refTime, userSettings.customKeywords, tagged)
      : null;
    setAutoDetected(detectedId, matchedEvent);

    // 키워드에 안 걸린 일정의 AI 해석 — 기다리지 않는다(AI 연결 설계 4장 규칙 1).
    // 결과는 캐시에 들어가고, "일정 기반 제안" 카드가 캐시를 읽어 나중에 나타난다.
    // AI가 꺼져 있거나 보낼 제목이 없으면 호출 없이 바로 끝난다.
    AiHintService.precompute(untaggedEvents(events, tagged)).catch(() => {});

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
      setUsingFallbackLocation(!coords);
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

  const refresh = async () => {
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

  return { todayEvents, now, refreshing, refresh, usingFallbackLocation };
}
