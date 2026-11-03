// 걷기 시작 감지 네이티브 모듈 (Android 전용, modules/ahmatda-motion/android).
// iOS(CMMotionActivity)는 macOS·Apple 계정이 생기면 붙인다. 그 전까지·테스트 환경·모듈이 빌드에
// 안 들어간 개발 빌드에서는 "쓸 수 없음"으로 동작한다 — 판정은 걷기 없이(decide.ts 권한 저하) 간다.
import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

// expo-modules-core의 EventSubscription과 같은 모양 — 그 패키지를 직접 의존하지 않으려고 따로 둔다.
interface Subscription {
  remove(): void;
}

interface AhmatdaMotionNative {
  start(): Promise<boolean>;
  stop(): Promise<void>;
  getWalkingStarts(): number[];
  addListener(event: 'onWalkingStart', listener: (e: { at: number }) => void): Subscription;
}

const native = requireOptionalNativeModule<AhmatdaMotionNative>('AhmatdaMotion');

export function isMotionSupported(): boolean {
  return Platform.OS === 'android' && native !== null;
}

// Android 10+만 런타임 권한이다. 9 이하는 설치 시 허용됨.
const needsRuntimePermission = () => Platform.OS === 'android' && Number(Platform.Version) >= 29;

export async function hasMotionPermission(): Promise<boolean> {
  if (!isMotionSupported()) return false;
  if (!needsRuntimePermission()) return true;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
}

export async function requestMotionPermission(): Promise<boolean> {
  if (!isMotionSupported()) return false;
  if (!needsRuntimePermission()) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

// 이 프로세스에서 구독을 이미 걸었는지. 다시 걸 때마다 Play 서비스가 지금 활동을 ENTER로 다시
// 보내서 "방금 걷기 시작" 가짜 신호가 생기므로, 권한 상태가 바뀔 때만 건다.
// (재부팅·앱 업데이트로 OS가 구독을 지우는 경우는 네이티브 MotionBootReceiver가 다시 건다.
//  앱 업데이트는 프로세스도 새로 뜨므로 여기 값도 초기화된다.)
let registered = false;

// 권한 상태에 맞춰 구독을 걸거나 푼다. 앱 시작·포그라운드 복귀·권한 허용 직후에 부른다.
// 반환값: 지금 걷기 신호를 쓸 수 있는지 (외출 판정의 availability.walking).
export async function syncWalkingDetection(): Promise<boolean> {
  if (!native) return false;
  try {
    if (await hasMotionPermission()) {
      if (!registered) registered = await native.start();
      return registered;
    }
    if (registered) {
      await native.stop();
      registered = false;
    }
    return false;
  } catch {
    return false;
  }
}

export function getWalkingStarts(): number[] {
  return native?.getWalkingStarts() ?? [];
}

export function addWalkingListener(listener: (at: number) => void): () => void {
  if (!native) return () => {};
  const subscription = native.addListener('onWalkingStart', (e) => listener(e.at));
  return () => subscription.remove();
}
