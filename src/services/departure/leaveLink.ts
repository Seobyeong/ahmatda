// 아맞다 — 홈 위젯 [떠나기] 링크 (docs/외출-감지-재설계.md 2장, 8단계)
//
// 위젯이 앱을 ahmatda://leave?n=<위젯이 발급한 값> 으로 연다. n이 진짜인지(다른 앱이 보낸 게 아닌지,
// 최근 앱 목록에서 다시 연 예전 링크가 아닌지)는 네이티브가 판단한다 — modules/ahmatda-widget
// consumeLeaveNonce. 여기서는 모양만 본다.

// 떠나기 링크면 n을, 아니면 null. n은 위젯이 만든 16진수 문자열이다.
export function parseLeaveLink(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /^ahmatda:\/\/leave\/?\?(?:.*&)?n=([0-9a-f]{1,32})(?:&.*)?$/i.exec(url.trim());
  return match ? match[1] : null;
}
