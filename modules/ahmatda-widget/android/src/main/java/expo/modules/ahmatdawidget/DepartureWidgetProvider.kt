package expo.modules.ahmatdawidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// 홈 화면 출발 위젯 — "08:15 출발 / 우산 · 노트북 외 1개" 두 줄.
// 표시 내용은 JS의 buildDepartureSnapshot이 정하고, 여기서는 그리기만 한다.
class DepartureWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { render(context, manager, it) }
  }

  companion object {
    const val PREFS = "ahmatda_widget"
    const val KEY_SNAPSHOT = "departure_snapshot"

    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, DepartureWidgetProvider::class.java))
      ids.forEach { render(context, manager, it) }
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int) {
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

      // 탭하면 앱 열기
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { intent ->
        val pending = PendingIntent.getActivity(
          context, 0, intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_root, pending)
      }

      manager.updateAppWidget(id, views)
    }
  }
}
