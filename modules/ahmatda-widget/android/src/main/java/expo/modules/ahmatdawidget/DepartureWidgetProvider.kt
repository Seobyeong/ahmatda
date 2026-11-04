package expo.modules.ahmatdawidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// 홈 화면 출발 위젯 — "08:15 출발 / 우산 · 노트북 외 1개" 두 줄 + [떠나기].
// 표시 내용은 JS의 buildDepartureSnapshot이 정하고, 여기서는 그리기만 한다.
//
// [떠나기]는 앱을 ahmatda://leave?n=… 로 연다 (JS가 앱의 [떠나기]와 같은 흐름을 돈다).
//   - n은 위젯이 발급한 임의값이고 이 앱의 SharedPreferences에만 있다. JS는 consumeLeaveNonce로
//     "지금 발급된 값과 같은지"를 확인하고 한 번 쓰면 버린다. 그래서
//       · 다른 앱이 MainActivity(exported)에 같은 모양의 링크를 보내도 n을 알 수 없어 통하지 않고
//       · 최근 앱 목록에서 다시 열 때 OS가 되돌려주는 예전 인텐트의 n은 이미 쓴 값이라 무시된다.
//   - 시스템이 주기 갱신(30분)으로 그 사이 다시 그려도 바로 전 값 하나는 받아준다 (탭과 갱신이 겹친 경우).
class DepartureWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    // 일부 위젯만 갱신하라고 와도 전부 다시 그린다 — 발급값이 바뀌면 모든 위젯의 [떠나기]가 같은 값을 가져야 한다.
    updateAll(context)
  }

  companion object {
    const val PREFS = "ahmatda_widget"
    const val KEY_SNAPSHOT = "departure_snapshot"
    const val LEAVE_LINK = "ahmatda://leave"
    private const val KEY_LEAVE_NONCE = "leave_nonce"
    private const val KEY_LEAVE_NONCE_PREV = "leave_nonce_prev"
    private val random = java.security.SecureRandom()

    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, DepartureWidgetProvider::class.java))
      renderAll(context, manager, ids)
    }

    private fun renderAll(context: Context, manager: AppWidgetManager, ids: IntArray) {
      if (ids.isEmpty()) return
      val nonce = issueNonce(context)
      ids.forEach { render(context, manager, it, nonce) }
    }

    // 새 값을 발급하고, 지금 값은 "바로 전 값"으로 한 칸 민다.
    @Synchronized
    private fun issueNonce(context: Context): String {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val next = java.lang.Long.toHexString(random.nextLong())
      prefs.edit()
        .putString(KEY_LEAVE_NONCE_PREV, prefs.getString(KEY_LEAVE_NONCE, null))
        .putString(KEY_LEAVE_NONCE, next)
        .commit()
      return next
    }

    // 위젯이 발급한 값(지금 또는 바로 전)이면 true — 쓰고 나면 둘 다 버리고 새로 그린다(다음 탭은 새 값).
    @Synchronized
    fun consumeLeaveNonce(context: Context, nonce: String): Boolean {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val valid = nonce.isNotEmpty() &&
        (nonce == prefs.getString(KEY_LEAVE_NONCE, null) || nonce == prefs.getString(KEY_LEAVE_NONCE_PREV, null))
      if (!valid) return false
      prefs.edit().remove(KEY_LEAVE_NONCE).remove(KEY_LEAVE_NONCE_PREV).commit()
      updateAll(context)
      return true
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int, nonce: String) {
      val views = RemoteViews(context.packageName, R.layout.ahmatda_departure_widget)

      val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null)
      val snapshot = raw?.let { runCatching { JSONObject(it) }.getOrNull() }
      val today = SimpleDateFormat("yyyy-MM-dd", Locale.KOREA).format(Date())

      // 어제 요약을 오늘 것처럼 보여주면 안 된다 — 앱을 열어야 오늘 체크리스트가 만들어진다.
      if (snapshot == null || snapshot.optString("date") != today) {
        views.setTextViewText(R.id.widget_title, context.getString(R.string.ahmatda_widget_label))
        views.setTextViewText(R.id.widget_detail, context.getString(R.string.ahmatda_widget_stale))
      } else {
        views.setTextViewText(R.id.widget_title, snapshot.optString("title"))
        views.setTextViewText(R.id.widget_detail, snapshot.optString("detail"))
      }

      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launch != null) {
        // 탭하면 앱 열기
        views.setOnClickPendingIntent(
          R.id.widget_root,
          PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )

        // [떠나기] — 런처 인텐트를 복사하지 않고 VIEW 인텐트를 새로 만든다 (LAUNCHER 카테고리가 섞이면
        // 일부 런처가 "앞으로 가져오기"로만 처리해 onNewIntent가 안 올 수 있다). requestCode로 열기와 구분.
        val leave = Intent(Intent.ACTION_VIEW, Uri.parse("$LEAVE_LINK?n=$nonce")).apply {
          component = launch.component
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        views.setOnClickPendingIntent(
          R.id.widget_leave,
          PendingIntent.getActivity(context, 1, leave, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )
      }

      manager.updateAppWidget(id, views)
    }
  }
}
