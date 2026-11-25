import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DepartureService } from '@/services/departure/DepartureService';
import { SignalLog } from '@/services/departure/signalLog';
import { currentWindow } from '@/utils/schedule';
import { scheduleOf, useAppStore } from '@/store';
import { classifyPresence } from './presence';
import { HOME_BSSID_KEY, getHomeBssid } from './homeWifi';
import type { ChecklistItem } from '@/types';

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
    await AsyncStorage.setItem(HOME_BSSID_KEY, bssid);
  },

  // 저장된 집 BSSID 조회
  async getHomeBssid(): Promise<string | null> {
    return getHomeBssid();
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

  // 1회성 Wi-Fi 확인 (백그라운드 폴링용) — 리스너/디바운스 없이 지금 상태를 신호 기록에 남기고
  // 외출 판정을 한 번 돌린다. 판정·알림·당일 중복 방지는 DepartureService가 한다.
  // 알림을 보냈으면 안 챙긴 항목을 반환한다.
  async checkOnce(): Promise<ChecklistItem[] | null> {
    const homeBssid = await WifiMonitorService.getHomeBssid();
    if (homeBssid) {
      const presence = classifyPresence(await NetInfo.fetch(), homeBssid);
      // 'unknown'이면 아무것도 기록하지 않는다 — 위치 권한이 잠깐 빠진 걸 이탈로 적으면
      // 집 소파에서 안전장치가 울린다. 같은 상태가 이어지면 기록은 처음 시각을 유지한다.
      if (presence === 'away') await SignalLog.record('wifiExit');
      if (presence === 'home') await SignalLog.record('wifiReturn');
    }
    // 집 Wi-Fi가 없어도 걷기·위치로 판정할 수 있다.
    return DepartureService.evaluate();
  },

  // 모니터링 시작. 외출 확정 알림(토스트 등)은 DepartureService.onDeparted로 받는다 —
  // 확정은 Wi-Fi 말고도 지오펜스·걷기·재확인 타이머에서 날 수 있어서다.
  async startMonitoring(): Promise<void> {
    // 짧은 시간 안에 startMonitoring이 중복 호출되면(예: 설정 화면에서 출발시각을
    // 연속 수정) AsyncStorage 조회가 끝나는 순서가 호출 순서와 다를 수 있어서,
    // 가장 마지막 호출만 리스너를 실제로 설치하도록 세대 번호로 막는다.
    const generation = ++monitorGeneration;
    const homeBssid = await WifiMonitorService.getHomeBssid();
    if (!homeBssid) return;  // BSSID 미등록 시 모니터링 안 함
    // 오늘 외출이 이미 확정됐으면 더 볼 게 없다 (5분마다 도는 재arm이 다시 걸지 않게)
    const departed = await DepartureService.hasDepartedToday();
    if (generation !== monitorGeneration) return;  // 그 사이 더 최신 호출이 있었음
    if (departed) return;

    // 이미 실행 중이면 중복 등록 방지
    WifiMonitorService.stopMonitoring();

    // stopMonitoring()이 세대 번호를 한 번 더 올리므로, 지금 설치하는 리스너의
    // 세대는 위에서 잡아둔 generation이 아니라 그 이후 값이다. 아래 디바운스
    // 콜백은 이 값과 비교해야 한다 (generation과 비교하면 항상 불일치라 알림이
    // 영영 안 나간다).
    const listenerGeneration = monitorGeneration;
    let awaySince: number | null = null;
    // 집 Wi-Fi를 다시 본 횟수 — 디바운스 콜백이 await하는 사이 재연결됐는지 알아내려고 센다.
    // (그 사이 기록된 wifiReturn은 앞선 이탈이 없어 버려지고, 뒤이어 이탈이 기록되면 집에 있는데
    //  "나감"이 마지막 상태로 남아 안전장치가 울린다.)
    let homeSeen = 0;

    // 2시간 후 자동 종료 (Wi-Fi 미이탈 시 배터리 보호)
    timeoutTimer = setTimeout(() => {
      WifiMonitorService.stopMonitoring();
    }, TIMEOUT_MS);

    unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const presence    = classifyPresence(state, homeBssid);
      const isConnected = state.isConnected ?? false;

      // 판정 불가 상태에서는 디바운스를 걸지도, 걸려 있던 것을 취소하지도 않는다.
      // 위치 권한이 잠깐 빠졌다고 진짜 이탈 감지를 취소해버리면 안 되기 때문이다.
      if (presence === 'unknown') return;

      // 집 Wi-Fi 끊김 감지
      if (presence === 'away' || !isConnected) {
        // 이탈 시각은 디바운스가 끝난 때가 아니라 처음 끊긴 때다 — 걷기·위치와 묶는 10분 창과
        // 안전장치 5분이 이 시각부터 센다.
        if (awaySince === null) awaySince = Date.now();
        // 10초 디바운스 — 일시적 끊김 무시
        if (debounceTimer) clearTimeout(debounceTimer);
        const exitAt = awaySince;
        debounceTimer = setTimeout(async () => {
          const homeSeenAtStart = homeSeen;
          // 재확인
          const rechecked = await NetInfo.fetch();

          // stopMonitoring()은 아직 대기 중인 타이머만 지울 수 있다. 이미 실행에 들어간
          // 콜백은 위 await에서 멈춰 있다가 그대로 재개되므로, 감시 창이 닫혔거나
          // disarm된 뒤에 알림이 나가고 당일 dedup 키까지 소진될 수 있다.
          // 리스너 설치 시점의 세대와 달라졌으면 이 콜백은 무효다.
          if (listenerGeneration !== monitorGeneration) return;

          if (homeSeen !== homeSeenAtStart) return;  // 기다리는 사이 다시 붙었다
          if (classifyPresence(rechecked, homeBssid) === 'away') {
            // Wi-Fi 이탈은 이제 "부가 신호"다 (결정 2). 걷기·위치가 붙거나 안전장치 5분이
            // 지나야 확정되므로, 여기서는 기록하고 판정만 돌린다. 판정·알림·당일 중복 방지는
            // DepartureService가 백그라운드 폴링과 같은 키로 한다.
            await SignalLog.record('wifiExit', exitAt);
            if (homeSeen !== homeSeenAtStart) {
              // 기록하는 사이 다시 붙었다 — 복귀를 이탈 뒤에 다시 적어 마지막 상태를 "집"으로 둔다.
              await SignalLog.record('wifiReturn');
              return;
            }
            if (listenerGeneration !== monitorGeneration) return;
            await DepartureService.evaluate();
            // 확정이면 App.tsx의 onDeparted 구독이 리스너를 내린다. 아직 확정이 아니면 남겨 둔다 —
            // 다시 붙으면(뭘 가지러 돌아옴) 복귀를 기록해야 안전장치가 울리지 않는다.
          }
        }, DEBOUNCE_MS);
      } else {
        // 집 Wi-Fi 재연결 시 디바운스 취소
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        awaySince = null;
        homeSeen++;
        // 이탈을 적어둔 적이 없으면 기록은 바뀌지 않는다 (같은 상태 중복 제거).
        if (presence === 'home') SignalLog.record('wifiReturn').catch(() => {});
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
  armForDeparture(): void {
    if (armInterval) { clearInterval(armInterval); armInterval = null; }

    const tick = () => {
      if (currentWindow(scheduleOf(useAppStore.getState()), new Date()) !== null) {
        if (!unsubscribe) WifiMonitorService.startMonitoring();
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
