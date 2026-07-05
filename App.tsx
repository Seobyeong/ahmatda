import { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import notifee, { EventType } from '@notifee/react-native';
import NetInfo from '@react-native-community/netinfo';

import AppNavigator from '@/navigation/AppNavigator';
import { NotificationService, handleNotificationBackgroundEvent } from '@/services/notification/NotificationService';
import { WifiMonitorService } from '@/services/wifi/WifiMonitorService';
import { BackgroundTaskService } from '@/services/backgroundTask/BackgroundTaskService';
import { useAppStore } from '@/store';

// 백그라운드 이벤트 핸들러 등록 (앱 실행 전 최상단에 등록 필수)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  await handleNotificationBackgroundEvent(type, detail);
});

export default function App() {
  const userSettings   = useAppStore(state => state.userSettings);
  const checklist      = useAppStore(state => state.checklist);

  useEffect(() => {
    // iOS에서 SSID/BSSID 조회를 시도하려면 이 설정이 반드시 필요함
    // (설정 안 하면 entitlements/위치권한과 무관하게 네이티브 조회 자체를 안 함)
    NetInfo.configure({ shouldFetchWiFiSSID: true });

    // 앱 시작 시 알림 채널 생성
    NotificationService.setupChannels();

    // 앱 시작 시 1회 백그라운드 폴링 등록 (react-native-background-fetch)
    BackgroundTaskService.configure();

    // 포그라운드 알림 이벤트 핸들러
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.ACTION_PRESS) {
        const actionId = detail.pressAction?.id;
        if (actionId && ['cold', 'good', 'hot'].includes(actionId)) {
          useAppStore.getState().applyFeedback(actionId as 'cold' | 'good' | 'hot');
        }
      }
    });

    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    // 온보딩 완료 후 알림 예약
    if (userSettings.onboarded) {
      NotificationService.rescheduleAll(
        userSettings.departureTime,
        checklist.filter(i => !i.checked).length
      );
      // 출발 알림 시각에 맞춰 백그라운드 확인 태스크도 함께 예약
      BackgroundTaskService.scheduleDepartureTask(userSettings.departureTime);
    }
  }, [userSettings.onboarded, userSettings.departureTime]);

  useEffect(() => {
    // 온보딩 완료 후 출발 시각 감시 창에 맞춰 Wi-Fi 이탈 모니터링을 매일 재arm
    // (집 BSSID가 없으면 서비스 내부에서 자동 스킵)
    if (!userSettings.onboarded) return;

    const arm = () => {
      WifiMonitorService.armForDeparture(userSettings.departureTime, (uncheckedItems) => {
        useAppStore.getState().showToast(
          `외출이 감지됐어요 — 아직 ${uncheckedItems.length}개를 못 챙겼어요.`
        );
      });
    };
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
    <>
      <StatusBar style="dark" />
      <AppNavigator />
    </>
  );
}
