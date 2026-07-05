import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationService } from '@/services/notification/NotificationService';
import { getTodayString, isWithinDepartureWindow } from '@/utils/time';
import type { ChecklistItem } from '@/types';

const BSSID_KEY         = 'home_bssid';
const ALERT_DATE_KEY    = 'wifi_alert_date';
const DEBOUNCE_MS       = 10_000;  // 10초 디바운스 (오탐 방지)
const TIMEOUT_MS        = 2 * 60 * 60 * 1000;  // 2시간 타임아웃 (배터리 보호용 안전장치)
const ARM_CHECK_INTERVAL_MS = 5 * 60 * 1000;  // 감시 창 진입/이탈 재확인 주기

let unsubscribe: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let timeoutTimer:  ReturnType<typeof setTimeout> | null = null;
let armInterval:   ReturnType<typeof setInterval> | null = null;
let monitorGeneration = 0;

export const WifiMonitorService = {

  // 집 Wi-Fi BSSID 저장
  async registerHomeBssid(bssid: string): Promise<void> {
    await AsyncStorage.setItem(BSSID_KEY, bssid);
  },

  // 저장된 집 BSSID 조회
  async getHomeBssid(): Promise<string | null> {
    return AsyncStorage.getItem(BSSID_KEY);
  },

  // 현재 연결된 BSSID 조회
  async getCurrentBssid(): Promise<string | null> {
    const state = await NetInfo.fetch();
    if (state.type !== 'wifi') return null;
    return (state.details as { bssid?: string })?.bssid ?? null;
  },

  // 현재 연결된 Wi-Fi를 홈 Wi-Fi로 재등록 (설정 화면의 "재등록" 액션용).
  // 연결된 Wi-Fi가 없으면 null을 반환하고 아무것도 등록하지 않는다.
  async registerCurrentWifiAsHome(): Promise<string | null> {
    const bssid = await WifiMonitorService.getCurrentBssid();
    if (!bssid) return null;
    await WifiMonitorService.registerHomeBssid(bssid);
    return bssid;
  },

  // 1회성 Wi-Fi 확인 (백그라운드 폴링용) — 리스너/디바운스 없이 즉시 판정.
  // 집 밖이고 미체크 항목이 있으면 긴급 알림을 보내고 그 목록을 반환한다.
  // 하루에 한 번만 알리도록 날짜 기준으로 중복 알림을 막는다.
  async checkOnce(): Promise<ChecklistItem[] | null> {
    const homeBssid = await WifiMonitorService.getHomeBssid();
    if (!homeBssid) return null;

    const today = getTodayString();
    const alreadyAlerted = await AsyncStorage.getItem(ALERT_DATE_KEY);
    if (alreadyAlerted === today) return null;

    const state = await NetInfo.fetch();
    const isHome = state.type === 'wifi' && (state.details as { bssid?: string })?.bssid === homeBssid;
    if (isHome) return null;

    const { useAppStore } = await import('@/store');
    const unchecked = useAppStore.getState().checklist.filter((i) => !i.checked);
    if (unchecked.length === 0) return null;

    await NotificationService.triggerUrgentAlert(unchecked);
    await AsyncStorage.setItem(ALERT_DATE_KEY, today);
    return unchecked;
  },

  // 모니터링 시작
  // onOuting: 외출 감지 시 호출될 콜백
  async startMonitoring(
    onOuting: (uncheckedItems: ChecklistItem[]) => void
  ): Promise<void> {
    // 짧은 시간 안에 startMonitoring이 중복 호출되면(예: 설정 화면에서 출발시각을
    // 연속 수정) AsyncStorage 조회가 끝나는 순서가 호출 순서와 다를 수 있어서,
    // 가장 마지막 호출만 리스너를 실제로 설치하도록 세대 번호로 막는다.
    const generation = ++monitorGeneration;
    const homeBssid = await WifiMonitorService.getHomeBssid();
    if (!homeBssid) return;  // BSSID 미등록 시 모니터링 안 함
    if (generation !== monitorGeneration) return;  // 그 사이 더 최신 호출이 있었음

    // 이미 실행 중이면 중복 등록 방지
    WifiMonitorService.stopMonitoring();

    // 2시간 후 자동 종료 (Wi-Fi 미이탈 시 배터리 보호)
    timeoutTimer = setTimeout(() => {
      WifiMonitorService.stopMonitoring();
    }, TIMEOUT_MS);

    unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const isWifi       = state.type === 'wifi';
      const currentBssid = (state.details as { bssid?: string })?.bssid;
      const isHome       = isWifi && currentBssid === homeBssid;
      const isConnected  = state.isConnected ?? false;

      // 집 Wi-Fi 끊김 감지
      if (!isHome || !isConnected) {
        // 10초 디바운스 — 일시적 끊김 무시
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          // 재확인
          const rechecked = await NetInfo.fetch();
          const stillAway =
            rechecked.type !== 'wifi' ||
            (rechecked.details as { bssid?: string })?.bssid !== homeBssid;

          if (stillAway) {
            // checkOnce()가 미체크 항목 조회, 알림 전송, 당일 중복 알림 방지까지 처리한다.
            // BackgroundTaskService의 주기적 폴링과 동일한 dedup 키를 공유해 이중 알림을 막는다.
            const unchecked = await WifiMonitorService.checkOnce();
            if (unchecked) {
              onOuting(unchecked);
            }

            WifiMonitorService.stopMonitoring();
          }
        }, DEBOUNCE_MS);
      } else {
        // 집 Wi-Fi 재연결 시 디바운스 취소
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
      }
    });
  },

  // 모니터링 중지
  stopMonitoring(): void {
    // 세대 번호를 올려서, 이 시점에 AsyncStorage 조회를 기다리고 있는 startMonitoring
    // 호출이 있다면 재개 시점에 무효화되도록 한다 (disarm 직후 뒤늦게 리스너가
    // 살아나는 것을 방지).
    monitorGeneration++;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (timeoutTimer)  { clearTimeout(timeoutTimer);  timeoutTimer  = null; }
  },

  // 출발 시각 기준 감시 창(출발 30분 전 ~ +2시간) 진입/이탈 여부를 주기적으로
  // 재확인해서 매일 재arm한다. 하루짜리 setTimeout 대신 짧은 주기 재확인을 쓰는 이유:
  // RN은 앱이 오래 백그라운드에 있으면 긴 타이머가 실행을 보장받지 못해서, 다음날
  // 같은 시각에 정확히 맞춰 실행돼야 하는 긴 타이머는 조용히 죽을 수 있다. 짧은
  // 주기로 반복 재확인하면 앱이 다시 활성화됐을 때 곧 따라잡는다.
  armForDeparture(
    departureTime: string,
    onOuting: (uncheckedItems: ChecklistItem[]) => void
  ): void {
    if (armInterval) { clearInterval(armInterval); armInterval = null; }

    const tick = () => {
      if (isWithinDepartureWindow(departureTime)) {
        if (!unsubscribe) WifiMonitorService.startMonitoring(onOuting);
      } else {
        WifiMonitorService.stopMonitoring();
      }
    };

    tick();
    armInterval = setInterval(tick, ARM_CHECK_INTERVAL_MS);
  },

  // 모니터링 + 재arm 인터벌 모두 중지 (앱 언마운트 시)
  disarm(): void {
    if (armInterval) { clearInterval(armInterval); armInterval = null; }
    WifiMonitorService.stopMonitoring();
  },
};
