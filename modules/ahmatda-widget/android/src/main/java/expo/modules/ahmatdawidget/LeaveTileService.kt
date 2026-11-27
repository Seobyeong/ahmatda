package expo.modules.ahmatdawidget

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

// 빠른 설정 타일 [떠나기] (C6, 2026-11-28) — 알림 창을 내려 누르면 위젯 [떠나기]와 똑같이
// ahmatda://leave?n=… 로 앱을 연다. n은 위젯과 같은 발급값이라 JS의 consumeLeaveNonce가 그대로 확인한다.
class LeaveTileService : TileService() {

  override fun onStartListening() {
    super.onStartListening()
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      label = getString(R.string.ahmatda_tile_label)
      updateTile()
    }
  }

  override fun onClick() {
    super.onClick()
    // 잠금화면에서 누르면 잠금을 푼 뒤 연다 — 앱 화면이 떠야 [떠나기] 결과(토스트)를 본다.
    if (isLocked) unlockAndRun { launchLeave() } else launchLeave()
  }

  @SuppressLint("StartActivityAndCollapseDeprecated")
  private fun launchLeave() {
    val intent = DepartureWidgetProvider.leaveIntent(this) ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startActivityAndCollapse(
        PendingIntent.getActivity(this, 2, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      )
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
