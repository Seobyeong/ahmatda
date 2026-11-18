// 아맞다 — 그날 외출했는지 판단할 흔적 (자기 전 정리, docs/외출-감지-재설계.md 5장)
//
// 저장하는 것: 외출 흔적이 있던 "날짜"(최근 7일)와, 집 Wi-Fi에 붙어 있던 걸 본 "시각"(최근 48시간).
// 좌표·Wi-Fi 이름은 남기지 않는다. 흔적을 남기는 곳:
//   · 외출 확정 (DepartureService)        · 집 반경 이탈 (집 지오펜스)
//   · 집 밖 장소에서 머묾 (AwayPlaceService) · 백그라운드 확인·앱 복귀 때 집 Wi-Fi 밖/안 (observeWifi)

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { classifyPresence } from '@/services/wifi/presence';
import { feedbackOutingDate } from '@/utils/schedule';

const KEY = 'outing_log';
const KEEP_DAYS = 7;
const KEEP_OBS_MS = 48 * 60 * 60 * 1000;
const OBS_DEDUPE_MS = 10 * 60 * 1000;

export interface OutingLogData {
  outDates: string[];
  homeObservations: number[];
}

let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

async function read(): Promise<OutingLogData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<OutingLogData>) : {};
    return {
      outDates: Array.isArray(parsed.outDates) ? parsed.outDates : [],
      homeObservations: Array.isArray(parsed.homeObservations) ? parsed.homeObservations : [],
    };
  } catch {
    return { outDates: [], homeObservations: [] };
  }
}

function write(data: OutingLogData): Promise<void> {
  return AsyncStorage.setItem(KEY, JSON.stringify(data));
}

export const OutingLog = {
  get(): Promise<OutingLogData> {
    return serialized(read);
  },

  // 진단 화면의 "테스트 기록 지우기"
  clear(): Promise<void> {
    return serialized(() => AsyncStorage.removeItem(KEY));
  },

  // 외출 흔적. 이미 있으면 그대로. 새로 생겼으면 true (자기 전 정리를 다시 계획할 신호).
  markOut(date: string): Promise<boolean> {
    return serialized(async () => {
      const data = await read();
      if (data.outDates.includes(date)) return false;
      const outDates = [...data.outDates, date].sort().slice(-KEEP_DAYS);
      await write({ ...data, outDates });
      return true;
    });
  },

  observeHome(at: number = Date.now()): Promise<void> {
    return serialized(async () => {
      const data = await read();
      const kept = data.homeObservations.filter((t) => at - t <= KEEP_OBS_MS);
      if (kept.some((t) => Math.abs(t - at) < OBS_DEDUPE_MS)) return;
      await write({ ...data, homeObservations: [...kept, at].sort((a, b) => a - b) });
    });
  },

  // 집 Wi-Fi 상태를 한 번 본다 — 백그라운드 확인(하루 종일)·앱 복귀 때. 집 Wi-Fi가 없으면 아무것도 안 함.
  // 'away'는 Wi-Fi를 끈 경우도 포함하지만, 그 결과는 "외출함"(평소처럼 피드백까지 보냄)이라 안전한 쪽이다.
  // 다시 계획하지는 않는다 — 부르는 쪽이 이어서 NightlyService.plan()을 부른다.
  async observeWifi(): Promise<void> {
    try {
      // 동적 import — WifiMonitorService → DepartureService → 이 모듈로 순환이 생긴다.
      const { WifiMonitorService } = await import('@/services/wifi/WifiMonitorService');
      const bssid = await WifiMonitorService.getHomeBssid();
      if (!bssid) return;
      const presence = classifyPresence(await NetInfo.fetch(), bssid);
      if (presence === 'home') await OutingLog.observeHome();
      if (presence === 'away') await OutingLog.markOut(await outingDateNow());
    } catch {
      // 관찰 실패는 "모름"으로 남는다 — 모르면 외출한 것으로 본다.
    }
  },
};

// 외출 흔적은 달력 날짜가 아니라 "그 시각이 속한 외출 날"에 단다 — 자기 전 정리가 보는 날과 같은 규칙
// (feedbackOutingDate: 지금 이전 가장 최근 출발의 날 — 쉬는 날은 건너뜀). 정리 시각이 00:30이면 00:05의 외출은 전날 것이다.
async function outingDateNow(): Promise<string> {
  const { useAppStore, scheduleOf } = await import('@/store');
  return feedbackOutingDate(scheduleOf(useAppStore.getState()), new Date());
}

// 외출 흔적 기록 — 신호 쪽(지오펜스·외출 확정·머묾)에서 쓴다. 흔적이 새로 생기면 오늘 밤 알림을 다시
// 계획하되 기다리지 않는다 — 긴급 알림·지오펜스 등록 같은 본 작업을 늦추면 안 된다.
export async function markOutingToday(): Promise<void> {
  try {
    if (await OutingLog.markOut(await outingDateNow())) {
      // 동적 import — NightlyService는 store·알림·날씨를 물고 있다.
      import('./NightlyService').then(({ NightlyService }) => NightlyService.plan()).catch(() => {});
    }
  } catch {
    // 조용히 — 알림 판정 경로를 막지 않는다
  }
}
