package expo.modules.ahmatdamotion

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity

// 활동 전환 구독 걸기/풀기 — JS 모듈과 부팅 리시버가 같이 쓴다.
object MotionRegistration {
  private const val REQUEST_CODE = 4127

  fun hasPermission(context: Context): Boolean {
    // Android 9 이하는 설치 시 권한이라 따로 확인할 게 없다.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) ==
      PackageManager.PERMISSION_GRANTED
  }

  // 같은 PendingIntent로 다시 걸면 교체될 뿐 중복되지 않는다.
  fun register(context: Context, onResult: (Boolean) -> Unit = {}) {
    if (!hasPermission(context)) {
      onResult(false)
      return
    }
    // 움직임 시작(외출 판정) + 정지·탈것 시작(집 밖 머묾 판정, 7단계)
    val transitions = (ActivityTransitionReceiver.MOVING_TYPES + DetectedActivity.STILL + DetectedActivity.IN_VEHICLE).map { type ->
      ActivityTransition.Builder()
        .setActivityType(type)
        .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
        .build()
    }
    try {
      ActivityRecognition.getClient(context)
        .requestActivityTransitionUpdates(ActivityTransitionRequest(transitions), pendingIntent(context))
        .addOnSuccessListener { onResult(true) }
        .addOnFailureListener { onResult(false) }
    } catch (e: SecurityException) {
      onResult(false)
    }
  }

  fun unregister(context: Context, onDone: () -> Unit = {}) {
    try {
      ActivityRecognition.getClient(context)
        .removeActivityTransitionUpdates(pendingIntent(context))
        .addOnCompleteListener { onDone() }
    } catch (e: SecurityException) {
      onDone()
    }
  }

  // Play 서비스가 전환 결과를 인텐트 extra로 채워 넣어야 해서 Android 12+에서는 MUTABLE이어야 한다.
  // 대상 클래스를 명시한 인텐트라 다른 앱이 가로챌 수 없다.
  private fun pendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, ActivityTransitionReceiver::class.java)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags)
  }
}
