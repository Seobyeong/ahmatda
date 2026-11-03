package expo.modules.ahmatdamotion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// 재부팅·앱 업데이트 뒤 활동 전환 구독을 다시 건다. OS가 이때 구독을 지우는데, 사용자가 아침에
// 앱을 안 열면 JS 쪽 재등록(앱 시작 시)이 돌지 않아 걷기 신호 없이 하루가 지나간다.
// 권한이 없으면 아무것도 하지 않는다.
class MotionBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
        val pending = goAsync()
        MotionRegistration.register(context.applicationContext) { pending.finish() }
      }
    }
  }
}
