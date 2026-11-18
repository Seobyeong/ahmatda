// 알람 화면 보조 네이티브 모듈 (Android 전용, modules/ahmatda-alarm/android).
// iOS·테스트·모듈이 빌드에 없는 개발 빌드에서는 조용히 아무것도 하지 않는다.
import { requireOptionalNativeModule } from 'expo';

interface AhmatdaAlarmNative {
  setShowOverLock(on: boolean): void;
  canUseFullScreenIntent(): boolean;
  openFullScreenIntentSettings(): void;
}

const native = requireOptionalNativeModule<AhmatdaAlarmNative>('AhmatdaAlarm');

// 알람이 울리는 동안만 앱 화면을 잠금화면 위에 띄우고 화면을 켜 둔다.
export function setShowOverLock(on: boolean): void {
  try {
    native?.setShowOverLock(on);
  } catch {
    // 화면이 없을 때(백그라운드) 부르면 무시
  }
}

export function canUseFullScreenIntent(): boolean {
  try {
    return native?.canUseFullScreenIntent() ?? true;
  } catch {
    return true;
  }
}

export function openFullScreenIntentSettings(): void {
  try {
    native?.openFullScreenIntentSettings();
  } catch {
    // 설정 화면을 못 열면 무시
  }
}
