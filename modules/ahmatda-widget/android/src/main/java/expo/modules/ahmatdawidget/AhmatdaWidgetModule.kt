package expo.modules.ahmatdawidget

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// JS → 홈 위젯 다리. JS가 만든 출발 요약(JSON)을 SharedPreferences에 써두고 위젯을 다시 그린다.
// 위젯은 앱 프로세스가 죽어 있어도 그려져야 해서, 화면에 필요한 값은 전부 여기 저장된 것만 쓴다.
class AhmatdaWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AhmatdaWidget")

    Function("setSnapshot") { json: String ->
      val context = appContext.reactContext ?: return@Function
      context.getSharedPreferences(DepartureWidgetProvider.PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(DepartureWidgetProvider.KEY_SNAPSHOT, json)
        .apply()
      DepartureWidgetProvider.updateAll(context)
    }
  }
}
