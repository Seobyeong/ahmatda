package expo.modules.ahmatdamotion

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

// JS ↔ 활동 전환 API 다리. 권한 요청은 JS(PermissionsAndroid)가 하고, 여기서는 구독·해제·기록 조회만.
class AhmatdaMotionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AhmatdaMotion")

    Events(EVENT_WALKING)

    OnCreate { current = WeakReference(this@AhmatdaMotionModule) }
    OnDestroy { if (current?.get() === this@AhmatdaMotionModule) current = null }

    // 걷기 시작 전환 구독. 권한이 없으면 false. 재부팅·업데이트 뒤 재등록은 MotionBootReceiver가 한다.
    AsyncFunction("start") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      MotionRegistration.register(context) { ok -> promise.resolve(ok) }
    }

    // 권한이 빠졌을 때 등 — 남아 있는 구독을 정리한다.
    AsyncFunction("stop") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      MotionRegistration.unregister(context) { promise.resolve(null) }
    }

    // 기록된 걷기 시작 시각들(epoch ms) — JS가 꺼져 있던 동안 들어온 것까지
    Function("getWalkingStarts") {
      val context = appContext.reactContext ?: return@Function emptyList<Double>()
      ActivityTransitionReceiver.readAll(context).map { it.toDouble() }
    }

    // 진단 화면의 테스트 기록 지우기
    Function("clearRecords") {
      val context = appContext.reactContext ?: return@Function null
      ActivityTransitionReceiver.clearAll(context)
      null
    }

    // 기록된 탈것 시작 시각들(epoch ms) — 집 밖 머묾 판정에서 "움직이는 중"으로 센다
    Function("getVehicleStarts") {
      val context = appContext.reactContext ?: return@Function emptyList<Double>()
      ActivityTransitionReceiver.readVehicle(context).map { it.toDouble() }
    }

    // 기록된 정지 시작 시각들(epoch ms) — 집 밖 머묾 판정용
    Function("getStillStarts") {
      val context = appContext.reactContext ?: return@Function emptyList<Double>()
      ActivityTransitionReceiver.readStill(context).map { it.toDouble() }
    }
  }

  companion object {
    const val EVENT_WALKING = "onWalkingStart"
    private var current: WeakReference<AhmatdaMotionModule>? = null

    fun emitWalking(at: Long) {
      current?.get()?.sendEvent(EVENT_WALKING, mapOf("at" to at.toDouble()))
    }
  }
}
