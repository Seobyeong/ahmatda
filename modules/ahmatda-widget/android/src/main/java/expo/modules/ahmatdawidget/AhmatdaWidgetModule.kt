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

    // 위젯 [떠나기] 링크의 n이 위젯이 발급한 값인지 확인하고 쓴다 (한 번만 true). DepartureWidgetProvider 참고.
    Function("consumeLeaveNonce") { nonce: String ->
      val context = appContext.reactContext ?: return@Function false
      DepartureWidgetProvider.consumeLeaveNonce(context, nonce)
    }
  }
}
