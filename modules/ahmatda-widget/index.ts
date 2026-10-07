// 홈 위젯 네이티브 모듈 (Android 전용, modules/ahmatda-widget/android).
// iOS·테스트 환경·모듈이 빌드에 안 들어간 개발 빌드에서는 조용히 아무것도 하지 않는다.
import { requireOptionalNativeModule } from 'expo';

interface AhmatdaWidgetNative {
  setSnapshot(json: string): void;
}

const native = requireOptionalNativeModule<AhmatdaWidgetNative>('AhmatdaWidget');

export function setWidgetSnapshot(snapshot: object): void {
  native?.setSnapshot(JSON.stringify(snapshot));
}
