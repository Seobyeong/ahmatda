import { useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import notifee, { EventType } from '@notifee/react-native';
import NetInfo from '@react-native-community/netinfo';

import AppNavigator from '@/navigation/AppNavigator';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NotificationService, handleNotificationEvent } from '@/services/notification/NotificationService';
import { WifiMonitorService } from '@/services/wifi/WifiMonitorService';
import { BackgroundTaskService } from '@/services/backgroundTask/BackgroundTaskService';
import { useAppStore } from '@/store';
import { buildDepartureSnapshot, type DepartureSnapshot } from '@/utils/departureSnapshot';
import { consumeLeaveNonce, setWidgetSnapshot } from './modules/ahmatda-widget';
import { parseLeaveLink } from '@/services/departure/leaveLink';
import { leaveResultMessage, pressLeave } from '@/services/departure/leave';
import { addWalkingListener, syncWalkingDetection } from './modules/ahmatda-motion';
import { DepartureService } from '@/services/departure/DepartureService';
import { NightlyService } from '@/services/nightly/NightlyService';
import { OutingLog } from '@/services/nightly/outingLog';
// 집 지오펜스 태스크 정의 — TaskManager.defineTask는 번들 최상위에서 돌아야 한다
// (앱이 화면 없이 백그라운드로 깨어나도 태스크가 정의돼 있게). import만으로 정의된다.
import { HomeGeofence } from '@/services/departure/homeGeofence';
// 집 밖 장소 지오펜스 태스크 정의 (같은 이유로 최상위 import)
import { AwayPlaceService } from '@/services/departure/AwayPlaceService';

// 백그라운드 이벤트 핸들러 등록 (앱 실행 전 최상단에 등록 필수)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  await handleNotificationEvent(type, detail);
});

export default function App() {
  const userSettings   = useAppStore(state => state.userSettings);
  // 자기 전 정리 알림의 "다음 외출: …" 한 줄이 이것들로 정해진다 — 바뀌면 다시 계획한다.
  const permanentRoutines = useAppStore(state => state.permanentRoutines);
  // 앱 밖 표시(출발 알림·잠금화면·홈 위젯)에 쓰이는 요약만 문자열로 구독한다 —
  // checklist 배열 전체를 구독하면 보이는 내용이 그대로여도(재빌드로 배열 identity만
  // 바뀌는 경우, 체크된 항목 삭제 등) 네이티브 알림 취소+재예약이 매번 일어난다.
  // 객체를 그대로 반환하면 매 호출마다 새 참조라 렌더 루프가 생기므로 직렬화한다.
  // 날짜는 오늘이 아니라 checklistDate — 아직 하루 전환 전이면 위젯이 "앱을 열어
  // 확인하세요"로 표시하게 한다.
  const snapshotJson = useAppStore(state => JSON.stringify(
    buildDepartureSnapshot(state.checklist, state.userSettings.departureTime, state.checklistDate ?? '')
  ));

  useEffect(() => {
    // iOS에서 SSID/BSSID 조회를 시도하려면 이 설정이 반드시 필요함
    // (설정 안 하면 entitlements/위치권한과 무관하게 네이티브 조회 자체를 안 함)
    NetInfo.configure({ shouldFetchWiFiSSID: true });

    // 앱 시작 시 알림 채널 생성
    NotificationService.setupChannels();

    // 앱 시작 시 1회 백그라운드 폴링 등록 (react-native-background-fetch)
    BackgroundTaskService.configure();

    // 걷기 시작 감지 구독 — 권한에 맞춰 걸거나 푼다. 설정에서 권한을 바꾸고 돌아오는 경우도
    // 있어 포그라운드 복귀마다 다시 맞춘다. (재부팅·업데이트 뒤엔 네이티브 부팅 리시버가 다시 건다.)
    // 집 지오펜스도 같은 이유로 맞춘다 (위치 '항상 허용'을 설정에서 켜고 돌아오는 경우).
    syncWalkingDetection();
    HomeGeofence.sync();
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncWalkingDetection();
        HomeGeofence.sync();
        AwayPlaceService.tick();
        OutingLog.observeWifi().then(() => NightlyService.plan());
      }
    });

    // 앱 프로세스가 살아 있을 때 걷기 시작이 오면 바로 판정한다. 죽어 있을 때 온 걷기는 네이티브가
    // 기록해 두고, 다음 판정(폴링·Wi-Fi·지오펜스)이 함께 본다. 감시 창 밖이면 판정이 알아서 거른다.
    const removeWalkingListener = addWalkingListener(() => {
      DepartureService.evaluate().catch(() => {});
      // 머문 자리를 벗어난 뒤 걷기가 오면 그때 "떠남"이 확정된다
      AwayPlaceService.tick();
    });

    // 외출이 확정되면(어느 신호로든) Wi-Fi 리스너는 더 돌 이유가 없다. 앱이 떠 있으면 토스트도 띄운다.
    const removeDepartedListener = DepartureService.onDeparted((unchecked) => {
      WifiMonitorService.stopMonitoring();
      if (unchecked.length > 0) {
        useAppStore.getState().showToast(`외출이 감지됐어요 — 아직 ${unchecked.length}개를 못 챙겼어요.`);
      }
    });

    // 앱이 완전히 종료된 상태에서 알림을 탭해 콜드스타트된 경우 —
    // onForegroundEvent/onBackgroundEvent 둘 다 이 최초 실행 시점에는 아직
    // 이벤트를 전달해주지 않으므로 별도로 확인해야 한다.
    notifee.getInitialNotification().then((initial) => {
      if (initial) handleNotificationEvent(EventType.PRESS, initial);
    });

    // 포그라운드 알림 이벤트 핸들러 — 백그라운드와 동일한 로직을 공유한다.
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      handleNotificationEvent(type, detail);
    });

    // 홈 위젯 [떠나기] — 앱을 ahmatda://leave?n=… 로 연다. 꺼져 있었으면 처음 URL로, 떠 있었으면 url
    // 이벤트로 온다. 앱 화면의 [떠나기]와 같은 흐름. 화면과 무관하게 여기서 받는다 (대시보드가 아직 안 떠도
    // 놓치지 않게). n이 위젯이 발급한 값인지는 네이티브가 확인하고 한 번 쓰면 버린다 — 다른 앱이 보낸 링크,
    // 최근 앱 목록에서 다시 연 예전 링크는 여기서 걸러진다.
    const onUrl = async (url: string | null) => {
      const nonce = parseLeaveLink(url);
      if (!nonce || !consumeLeaveNonce(nonce)) return;
      const { whenHydrated } = await import('@/store');
      await whenHydrated();
      if (!useAppStore.getState().userSettings.onboarded) return;
      useAppStore.getState().showToast(leaveResultMessage(await pressLeave()));
    };
    Linking.getInitialURL().then(onUrl).catch(() => {});
    const urlSub = Linking.addEventListener('url', ({ url }) => { onUrl(url).catch(() => {}); });

    return () => { unsubscribe(); appStateSub.remove(); urlSub.remove(); removeWalkingListener(); removeDepartedListener(); DepartureService.cancelRecheck(); };
  }, []);

  useEffect(() => {
    // 온보딩 완료 또는 출발시각·자기 전 정리 시각 변경 시 정리 알림을 재예약한다.
    // (본문에 출발 시각이 들어가서 출발시각 변경에도 반응한다.)
    // 출발 알림은 아래 effect가 전담한다.
    // 날짜별로 따로 예약하고 오늘 밤 것은 외출 여부·다음 외출에 따라 바꾼다 (NightlyService).
    // 설정·루틴이 바뀌면 미리보기 캐시를 쓰지 않고 다시 계산한다.
    if (!userSettings.onboarded) return;
    useAppStore.getState().ensureOnboardedDate();
    OutingLog.observeWifi().then(() => NightlyService.plan({ fresh: true }));
  }, [
    userSettings.onboarded, userSettings.departureTime, userSettings.nightlyCheckTime, userSettings.alertPreference,
    userSettings.disabledWeatherItems, userSettings.disabledPurposeItems, userSettings.customKeywords,
    userSettings.commuteMode, permanentRoutines,
  ]);

  useEffect(() => {
    // 출발 알림 시각에 맞춰 백그라운드 확인 태스크 예약 — 정리 시각과는 무관해서 따로 둔다.
    if (!userSettings.onboarded) return;
    BackgroundTaskService.scheduleDepartureTask(userSettings.departureTime);
  }, [userSettings.onboarded, userSettings.departureTime]);

  useEffect(() => {
    // 출발 알림은 아직 안 챙긴 것을 본문에 담으므로, 요약이 바뀔 때마다 다시 예약해
    // 문구를 갱신한다. 위 effect에만 맡기면 온보딩/출발시각이 바뀔 때만 갱신돼서
    // 그 사이의 체크리스트 변경이 반영되지 않는다. 이미 떠 있는 잠금화면 상태와
    // 홈 위젯도 같은 요약으로 함께 갱신한다.
    if (!userSettings.onboarded) return;

    const snapshot = JSON.parse(snapshotJson) as DepartureSnapshot;
    // 홈 위젯은 사용자가 직접 올려둔 것이라 알림 성향과 무관하게 갱신한다.
    setWidgetSnapshot(snapshot);

    // 알림 성향 "필요할 때만"은 출발 전 알림을 쓰지 않는다 (취소는 아래 effect가 한 번만)
    if (userSettings.alertPreference === 'minimal') return;
    NotificationService.scheduleDepartureAlert(userSettings.departureTime, snapshot);
    NotificationService.updateDepartureStatus(userSettings.departureTime, snapshot);
  }, [userSettings.onboarded, userSettings.departureTime, userSettings.alertPreference, snapshotJson]);

  useEffect(() => {
    // "필요할 때만"으로 바꾸면 이미 잡힌 출발 알림 예약과 떠 있는 것을 내린다.
    // 체크할 때마다가 아니라 성향이 바뀔 때만 돈다.
    if (!userSettings.onboarded || userSettings.alertPreference !== 'minimal') return;
    NotificationService.cancelDepartureAlert().catch(() => {});
  }, [userSettings.onboarded, userSettings.alertPreference]);

  useEffect(() => {
    // 온보딩 완료 후 출발 시각 감시 창에 맞춰 Wi-Fi 이탈 모니터링을 매일 재arm
    // (집 BSSID가 없으면 서비스 내부에서 자동 스킵)
    if (!userSettings.onboarded) return;

    const arm = () => WifiMonitorService.armForDeparture(userSettings.departureTime);
    arm();

    // 앱이 오래 백그라운드에 있으면 재확인 인터벌 자체가 실행을 보장받지 못할 수
    // 있어서, 포그라운드로 돌아올 때마다 한 번 더 재확인해 스스로 회복하게 한다.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') arm();
    });

    return () => {
      appStateSub.remove();
      WifiMonitorService.disarm();
    };
  }, [userSettings.onboarded, userSettings.departureTime]);

  return (
    <ErrorBoundary>
      <StatusBar style="dark" />
      <AppNavigator />
    </ErrorBoundary>
  );
}
