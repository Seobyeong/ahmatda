package expo.modules.ahmatdawidget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

// 홈 위젯에서 물건 줄의 [챙김]을 눌렀을 때 (C3, 2026-11-28) — 앱 화면을 열지 않는다.
//
// 앱 상태(체크리스트)는 JS 쪽에 있어서 여기서 바로 바꿀 수 없다. 그래서
//   1) 누른 것을 "대기 중인 챙김"으로 SharedPreferences에 쌓고 (JS가 takePendingChecks로 가져가 반영)
//   2) 위젯이 보여 주는 요약에서 그 물건을 빼고 바로 다시 그린다 (누른 느낌이 즉시 나게).
// JS는 앱이 화면에 올 때, 외출 판정·[떠나기]·알림 버튼 처리 전에 대기 중인 것을 먼저 반영한다
// (위젯에서 챙긴 우산을 외출 감지가 "안 챙김"으로 알리지 않게).
// JS가 반영하기 전에 새 요약을 써도(setSnapshot) 대기 중인 것은 다시 빼서 위젯에 되살아나지 않게 한다.
// exported=false — 이 앱의 위젯 PendingIntent만 보낼 수 있다.
class WidgetCheckReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val label = intent.getStringExtra(EXTRA_LABEL) ?: return
    val date = intent.getStringExtra(EXTRA_DATE) ?: return
    queueCheck(context, label, date)
    DepartureWidgetProvider.updateAll(context)
  }

  companion object {
    const val ACTION_CHECK = "expo.modules.ahmatdawidget.CHECK"
    const val EXTRA_LABEL = "label"
    const val EXTRA_DATE = "date"
    private const val KEY_PENDING = "pending_checks"
    private const val MAX_PENDING = 20
    // JS buildDepartureSnapshot과 같은 규칙: 이름은 2개까지, 나머지는 "외 N개"
    private const val DETAIL_MAX_LABELS = 2

    private fun readPending(prefs: android.content.SharedPreferences): JSONArray =
      runCatching { JSONArray(prefs.getString(KEY_PENDING, "[]")) }.getOrElse { JSONArray() }

    @Synchronized
    fun queueCheck(context: Context, label: String, date: String) {
      val prefs = context.getSharedPreferences(DepartureWidgetProvider.PREFS, Context.MODE_PRIVATE)
      // 다른 날짜의 대기분은 JS가 어차피 버린다 — 쌓여서 오늘 것이 못 들어가는 일이 없게 먼저 뺀다
      val old = readPending(prefs)
      val pending = JSONArray()
      for (i in 0 until old.length()) {
        val entry = old.optJSONObject(i) ?: continue
        if (entry.optString("date") == date) pending.put(entry)
      }
      if (pending.length() >= MAX_PENDING) return  // 큐에 못 넣었으면 위젯도 그대로 둔다
      pending.put(JSONObject().put("label", label).put("date", date))

      val editor = prefs.edit().putString(KEY_PENDING, pending.toString())
      val raw = prefs.getString(DepartureWidgetProvider.KEY_SNAPSHOT, null)
      if (raw != null) editor.putString(DepartureWidgetProvider.KEY_SNAPSHOT, withoutPending(raw, pending))
      editor.commit()
    }

    // 요약(JSON)에서 대기 중인 챙김을 뺀다 — 위젯 [챙김] 직후, 그리고 JS가 반영 전 요약을 쓸 때(setSnapshot).
    fun withoutPending(snapshotJson: String, pending: JSONArray): String {
      val snapshot = runCatching { JSONObject(snapshotJson) }.getOrNull() ?: return snapshotJson
      val date = snapshot.optString("date")
      val done = HashSet<String>()
      for (i in 0 until pending.length()) {
        val entry = pending.optJSONObject(i) ?: continue
        if (entry.optString("date") == date) done.add(entry.optString("label"))
      }
      if (done.isEmpty()) return snapshotJson

      val items = snapshot.optJSONArray("checkable") ?: JSONArray()
      val left = ArrayList<String>()
      for (i in 0 until items.length()) {
        val item = items.optString(i)
        if (item !in done) left.add(item)
      }
      val removed = items.length() - left.size
      if (removed == 0) return snapshotJson
      val remaining = (snapshot.optInt("remaining", 0) - removed).coerceAtLeast(0)
      snapshot.put("checkable", JSONArray(left))
      snapshot.put("remaining", remaining)
      snapshot.put("detail", detailOf(left, remaining))
      return snapshot.toString()
    }

    // "우산 · 노트북 외 1개" / "준비 완료" — JS buildDepartureSnapshot의 detail과 같은 모양
    private fun detailOf(left: List<String>, remaining: Int): String {
      if (remaining == 0) return "준비 완료"
      val shown = left.take(DETAIL_MAX_LABELS)
      val rest = remaining - shown.size
      return if (shown.isEmpty()) "${remaining}개 남음"
      else shown.joinToString(" · ") + if (rest > 0) " 외 ${rest}개" else ""
    }

    fun pendingJson(context: Context): JSONArray =
      readPending(context.getSharedPreferences(DepartureWidgetProvider.PREFS, Context.MODE_PRIVATE))

    // JS가 가져가 반영한다 — 가져가면 비운다.
    @Synchronized
    fun takePendingChecks(context: Context): String {
      val prefs = context.getSharedPreferences(DepartureWidgetProvider.PREFS, Context.MODE_PRIVATE)
      val raw = prefs.getString(KEY_PENDING, "[]") ?: "[]"
      prefs.edit().remove(KEY_PENDING).commit()
      return raw
    }
  }
}
