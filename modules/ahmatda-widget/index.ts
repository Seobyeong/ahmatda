// 홈 위젯 네이티브 모듈 (Android 전용, modules/ahmatda-widget/android).
// iOS·테스트 환경·모듈이 빌드에 안 들어간 개발 빌드에서는 조용히 아무것도 하지 않는다.
import { requireOptionalNativeModule } from 'expo';

interface AhmatdaWidgetNative {
  setSnapshot(json: string): void;
  consumeLeaveNonce?(nonce: string): boolean;
}

const native = requireOptionalNativeModule<AhmatdaWidgetNative>('AhmatdaWidget');

export function setWidgetSnapshot(snapshot: object): void {
  native?.setSnapshot(JSON.stringify(snapshot));
}

// 위젯 [떠나기] 링크의 n이 위젯이 발급한 값이면 true (한 번만). 다른 앱이 보낸 링크, 최근 앱 목록에서
// 다시 연 예전 링크는 false. 쓰고 나면 위젯이 새 값으로 다시 그려진다.
export function consumeLeaveNonce(nonce: string): boolean {
  try {
    return native?.consumeLeaveNonce?.(nonce) ?? false;
  } catch {
    return false;
  }
}
