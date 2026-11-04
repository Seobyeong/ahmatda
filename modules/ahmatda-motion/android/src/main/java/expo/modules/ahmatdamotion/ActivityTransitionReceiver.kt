package expo.modules.ahmatdamotion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity
import org.json.JSONArray

// 걷기(·달리기·자전거) 시작 전환을 받아 기록한다 (docs/외출-감지-재설계.md 3장 "걷기 시작" 주 신호).
// 정지(STILL) 시작도 따로 기록한다 — 집 밖 장소에서 머무는지 판단하는 데 쓴다 (4장, 7단계).
//
// 앱 프로세스가 백그라운드여도 Play 서비스가 이 리시버를 깨운다. JS가 살아 있으면 바로 이벤트로
// 넘기고, 아니면 기록만 해둔다 — JS가 다음에 돌 때(백그라운드 폴링·앱 복귀) 읽어 간다.
// 판정은 JS(decide.ts)가 한다. 여기서는 시각만 남긴다.
class ActivityTransitionReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityTransitionResult.hasResult(intent)) return
    val result = ActivityTransitionResult.extractResult(intent) ?: return

    for (event in result.transitionEvents) {
      if (event.transitionType != ActivityTransition.ACTIVITY_TRANSITION_ENTER) continue

      // 이벤트 시각은 부팅 후 경과 나노초다. 벽시계 epoch ms로 바꿔야 JS의 다른 신호(Wi-Fi 이탈 등)와
      // 같은 축에서 비교할 수 있다.
      val ageMs = (SystemClock.elapsedRealtimeNanos() - event.elapsedRealTimeNanos) / 1_000_000
      val at = System.currentTimeMillis() - ageMs

      if (event.activityType == DetectedActivity.STILL) {
        recordStill(context, at)
        continue
      }
      // 탈것(버스·지하철·차) — 외출 판정의 걷기는 아니지만, 머묾 판정에는 "움직이는 중"이다.
      // 안 받으면 25분 지하철 탑승이 마지막 걷기 뒤의 긴 정지로 보여 중간역이 "머문 곳"이 된다.
      if (event.activityType == DetectedActivity.IN_VEHICLE) {
        recordTimes(context, KEY_VEHICLE, at, KEEP_MS, MAX_RECORDS)
        continue
      }
      if (event.activityType !in MOVING_TYPES) continue

      // 구독을 다시 걸 때마다 Play 서비스가 지금 활동을 ENTER로 다시 보내고, 걷기·달리기 ENTER가
      // 한 결과에 같이 올 수도 있다. 이미 기록된 것과 가까우면 같은 움직임으로 보고 버린다 —
      // 안 그러면 앱을 열 때마다 "방금 걷기 시작"이 새로 생겨 외출 판정이 잘못 확정될 수 있다.
      if (record(context, at)) AhmatdaMotionModule.emitWalking(at)
    }
  }

  companion object {
    const val PREFS = "ahmatda_motion"
    private const val KEY_WALKING = "walking_starts"
    private const val KEY_STILL = "still_starts"
    private const val KEY_VEHICLE = "vehicle_starts"
    // 정지는 몇 시간씩 이어질 수 있어(카페·회사) 걷기보다 길게 둔다.
    private const val STILL_KEEP_MS = 24 * 60 * 60 * 1000L
    private const val STILL_MAX_RECORDS = 50
    // 판정은 최근 10분(안전장치도 2시간)만 본다. 집 안을 오가는 걷기로 개수 제한이 먼저 차서
    // 필요한 기록이 밀려나지 않게, 개수가 아니라 시간으로 자른다 (개수는 상한만).
    private const val KEEP_MS = 3 * 60 * 60 * 1000L
    private const val MAX_RECORDS = 200
    private const val DUPLICATE_MS = 2 * 60 * 1000L

    // 집을 나서는 움직임으로 보는 활동. 차에 타는 것(IN_VEHICLE)은 집 밖에서 일어나므로 뺀다.
    val MOVING_TYPES = setOf(DetectedActivity.WALKING, DetectedActivity.RUNNING, DetectedActivity.ON_BICYCLE)

    // 새로 기록했으면 true, 중복이라 버렸으면 false
    fun record(context: Context, at: Long): Boolean {
      val existing = readAll(context)
      if (existing.any { kotlin.math.abs(it - at) < DUPLICATE_MS }) return false

      val cutoff = System.currentTimeMillis() - KEEP_MS
      val kept = (existing + at).filter { it >= cutoff }.sorted().takeLast(MAX_RECORDS)
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(KEY_WALKING, JSONArray(kept).toString())
        .apply()
      return true
    }

    // 정지 시작 기록 (집 밖 머묾 판정, docs/외출-감지-재설계.md 4장). 마지막 움직임 이후 이미 정지가
    // 기록돼 있으면 처음 시각을 유지한다 — 구독을 다시 걸 때(앱을 열 때) Play 서비스가 지금 활동을
    // ENTER로 다시 보내는데, 그걸 새 정지로 받으면 "20분 머묾"이 앱을 열 때마다 처음부터 다시 센다.
    fun recordStill(context: Context, at: Long) {
      val stills = readAll(context, KEY_STILL)
      val lastStill = stills.maxOrNull()
      val lastMoving = (readAll(context) + readAll(context, KEY_VEHICLE)).maxOrNull()
      if (lastStill != null && (lastMoving == null || lastStill > lastMoving) && lastStill <= at) return
      recordTimes(context, KEY_STILL, at, STILL_KEEP_MS, STILL_MAX_RECORDS)
    }

    private fun recordTimes(context: Context, key: String, at: Long, keepMs: Long, max: Int) {
      val existing = readAll(context, key)
      if (existing.any { kotlin.math.abs(it - at) < DUPLICATE_MS }) return
      val cutoff = System.currentTimeMillis() - keepMs
      val kept = (existing + at).filter { it >= cutoff }.sorted().takeLast(max)
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(key, JSONArray(kept).toString())
        .apply()
    }

    // 진단 화면의 "테스트 기록 지우기" — 같은 날 시나리오를 반복할 때 앞선 걷기·정지가 판정에 섞이지 않게
    fun clearAll(context: Context) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().remove(KEY_WALKING).remove(KEY_STILL).remove(KEY_VEHICLE).apply()
    }

    fun readStill(context: Context): List<Long> = readAll(context, KEY_STILL)
    fun readVehicle(context: Context): List<Long> = readAll(context, KEY_VEHICLE)

    fun readAll(context: Context, key: String = KEY_WALKING): List<Long> {
      val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key, null)
        ?: return emptyList()
      return runCatching {
        val array = JSONArray(raw)
        (0 until array.length()).map { array.getLong(it) }
      }.getOrDefault(emptyList())
    }
  }
}
