package expo.modules.ahmatdaalarm

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// 알람 화면 보조. 앱 화면 전체를 항상 잠금화면 위에 띄우면 아무나 앱을 볼 수 있으므로,
// 알람이 울리는 동안에만 켜고 끄면 바로 되돌린다 (JS의 AlarmOverlay가 켜고 끈다).
class AhmatdaAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AhmatdaAlarm")

    Function("setShowOverLock") { on: Boolean ->
      val activity = appContext.currentActivity ?: return@Function null
      activity.runOnUiThread {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          activity.setShowWhenLocked(on)
          activity.setTurnScreenOn(on)
        } else {
          @Suppress("DEPRECATION")
          val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          if (on) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
        }
        // 화면이 꺼지지 않게 — 울리는 동안만
        if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }

    // Android 14+: 전체 화면 알림 권한. 없으면 잠금화면에 알람 화면 대신 알림만 뜬다(소리는 울림).
    Function("canUseFullScreenIntent") {
      val context = appContext.reactContext ?: return@Function true
      if (Build.VERSION.SDK_INT < 34) return@Function true
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.canUseFullScreenIntent()
    }

    Function("openFullScreenIntentSettings") {
      val context = appContext.reactContext ?: return@Function null
      val intent = if (Build.VERSION.SDK_INT >= 34) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
      } else {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
