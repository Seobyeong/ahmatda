// 진단 화면 — 실기기 검증용 (docs/실기기-검증-가이드.md 1장). 설정 패널 제목 "설정"을 길게 누르면 열린다.
// 기기 안 정보만 보여준다 (좌표는 보여주지 않고 등록 여부만). 아무것도 기기 밖으로 보내지 않는다.
// 미리보기 APK로도 검증해야 해서 정식 빌드에서도 열리지만, 실제 알림을 보내거나 기록을 지우는 버튼은
// 누를 때마다 확인을 받는다 (잘못 들어온 사용자가 "놓침" 기록을 오염시키지 않게).

import { getHomeWifi } from '@/services/wifi/homeWifi';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import notifee from '@notifee/react-native';
import * as Location from 'expo-location';
import { X } from 'lucide-react-native';
import { FontSize, Radius, makeStyles, useTheme } from '../constants/theme';
import { DepartureService } from '../services/departure/DepartureService';
import { AwayPlaceService } from '../services/departure/AwayPlaceService';
import { HOME_GEOFENCE_TASK, HomeGeofence } from '../services/departure/homeGeofence';
import { SignalLog } from '../services/departure/signalLog';
import { NightlyService } from '../services/nightly/NightlyService';
import { OutingLog } from '../services/nightly/outingLog';
import { WifiMonitorService } from '../services/wifi/WifiMonitorService';
import { useAppStore } from '../store';
import {
  clearMotionRecords, getStillStarts, getVehicleStarts, getWalkingStarts, hasMotionPermission, isMotionSupported,
} from '../../modules/ahmatda-motion';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Row = [label: string, value: string];
interface Section {
  title: string;
  rows: Row[];
}

const pad = (n: number) => String(n).padStart(2, '0');
function hm(at: number): string {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const yn = (b: boolean) => (b ? '예' : '아니요');
const recent = (times: number[], n = 5) =>
  times.length === 0 ? '없음' : [...times].sort((a, b) => b - a).slice(0, n).map(hm).join(', ');

async function collect(): Promise<Section[]> {
  const [fg, bg, motion, notif, homeCoords, homeStarted, departure, place, outing, triggers, homeWifi] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.getBackgroundPermissionsAsync().catch(() => null),
    hasMotionPermission().catch(() => false),
    notifee.getNotificationSettings().catch(() => null),
    HomeGeofence.getHomeCoords(),
    Location.hasStartedGeofencingAsync(HOME_GEOFENCE_TASK).catch(() => false),
    DepartureService.inspect(),
    AwayPlaceService.inspect(),
    OutingLog.get(),
    notifee.getTriggerNotificationIds().catch(() => [] as string[]),
    getHomeWifi().catch(() => null),
  ]);

  const d = departure.decision;
  const decision =
    d.status === 'confirmed' ? `확정 ${hm(d.at)} · ${d.by.join('+')}`
    : d.status === 'candidate' ? `후보 (${hm(d.since)}부터)`
    : '없음';
  const p = place.state.place;

  return [
    {
      title: '권한',
      rows: [
        ['위치 (사용 중)', yn(!!fg?.granted)],
        ['위치 (항상 허용)', yn(!!bg?.granted)],
        ['신체 활동', isMotionSupported() ? yn(motion) : '이 기기에서 지원 안 함'],
        ['알림', notif ? yn(notif.authorizationStatus >= 1) : '?'],
      ],
    },
    {
      title: '외출 판정',
      rows: [
        ['걷기 신호 사용', yn(departure.availability.walking)],
        ['위치 신호 사용', yn(departure.availability.location)],
        ['집 좌표 등록', yn(homeCoords !== null)],
        ['집 지오펜스', homeStarted ? '걸림' : '안 걸림'],
        // '연결됨'이면 Wi-Fi 안전장치로는 확정하지 않는다 (판정 규칙 8)
        // 듀얼밴드·메시 공유기 자동 학습 — 이름을 아직 모르면 같은 이름의 다른 BSSID를 못 배운다
        ['집 Wi-Fi 학습', homeWifi ? `${homeWifi.ssid ?? '이름 모름'} · BSSID ${homeWifi.bssids.length}개` : '미등록'],
        ['지금 집 Wi-Fi', departure.homeWifiNow === 'home' ? '연결됨' : departure.homeWifiNow === 'away' ? '밖' : '모름'],
        ['지금 판정', decision],
        // 판정이 "확정"이어도 아래가 막으면 알림은 안 간다 (DepartureService.evaluate의 조건)
        ['출발 감시 창 안', yn(departure.inWindow)],
        ['긴급 알림 보낸 날', departure.alertedDate ?? '없음'],
        ['외출 확정한 날', departure.departedDate ?? '없음'],
        ['신호 기록', departure.signals.length === 0 ? '없음'
          : [...departure.signals].sort((a, b) => b.at - a.at).slice(0, 8).map((s) => `${s.type}${s.onHomeWifi ? '(집 Wi-Fi·무시)' : ''} ${hm(s.at)}`).join('\n')],
      ],
    },
    {
      title: '신체 활동 기록 (최근 것부터)',
      rows: [
        ['걷기 시작', recent(getWalkingStarts())],
        ['탈것 시작', recent(getVehicleStarts())],
        ['정지 시작', recent(getStillStarts())],
      ],
    },
    {
      title: '집 밖에서 떠날 때',
      rows: [
        ['동작 조건 충족', yn(place.canRun)],
        ['머무는 자리', p ? `있음 · 머묾 ${hm(p.since)} · 등록 ${hm(p.registeredAt)}${p.exitAt ? ` · 이탈 ${hm(p.exitAt)}` : ''}` : '없음'],
        ['자리 지오펜스', place.geofenceStarted ? '걸림' : '안 걸림'],
        ['오늘 보낸 횟수', `${place.state.sent} / 3`],
      ],
    },
    {
      title: '자기 전 정리',
      rows: [
        ['외출한 날', outing.outDates.length ? outing.outDates.join(', ') : '없음'],
        ['집 Wi-Fi 관찰', recent(outing.homeObservations, 8)],
        ['예약된 알림', triggers.length ? [...triggers].sort().join('\n') : '없음'],
      ],
    },
  ];
}

export function DiagnosticsModal({ visible, onClose }: Props) {
  const { Colors } = useTheme();
  const styles = useStyles();
  const [sections, setSections] = useState<Section[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSections(await collect());
    } catch (e) {
      setSections([{ title: '오류', rows: [['읽기 실패', String(e)]] }]);
    }
  }, []);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  // 실제 알림이 가거나 기록이 바뀌는 버튼 — 누를 때마다 확인
  const run = (label: string, warning: string, work: () => Promise<unknown>) => () => {
    Alert.alert(label, `${warning}\n\n실기기 검증용 기능이에요. 계속할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '계속',
        onPress: async () => {
          setBusy(label);
          try {
            await work();
          } catch (e) {
            Alert.alert(`${label} 실패`, String(e));
          } finally {
            setBusy(null);
            refresh();
          }
        },
      },
    ]);
  };

  // 같은 날 시나리오를 다시 하려고 앞선 기록을 지운다. 외출 흔적(최근 7일)은 자기 전 정리 판단에 쓰이는
  // 실제 기록이라 지우지 않는다. 지운 뒤 Wi-Fi 감시를 다시 걸고 오늘 밤 계획도 다시 한다.
  const resetForTest = async () => {
    await Promise.all([
      SignalLog.clear(),
      DepartureService.resetForTest(),
      AwayPlaceService.resetForTest(),
    ]);
    clearMotionRecords();
    useAppStore.getState().clearLeaveIntent();
    WifiMonitorService.armForDeparture();
    await NightlyService.plan({ fresh: true });
  };

  const actions: Array<[string, string, () => Promise<unknown>]> = [
    ['지금 판정', '외출이 확정이면 실제 긴급 알림이 가고 "놓침"이 기록돼요.', () => DepartureService.evaluate()],
    ['머묾 확인', '떠남이 확정이면 실제 알림이 가요. 위치를 한 번 켤 수 있어요.', () => AwayPlaceService.tick()],
    ['자기 전 계획', '오늘 밤 자기 전 정리 알림을 지금 상태로 다시 예약해요.',
      () => OutingLog.observeWifi().then(() => NightlyService.plan({ fresh: true }))],
    ['테스트 기록 지우기', '신호·걷기 기록, 오늘 알림 보낸 표시, 머무는 자리, [떠나기] 기록을 지워요.', resetForTest],
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>진단</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="닫기">
            <X size={22} color={Colors.slate500} />
          </Pressable>
        </View>

        <View style={styles.actions}>
          {actions.map(([label, warning, work]) => (
            <Pressable key={label} style={styles.action} onPress={run(label, warning, work)} disabled={busy !== null}>
              <Text style={styles.actionText}>{busy === label ? '…' : label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.action} onPress={refresh} disabled={busy !== null}>
            <Text style={styles.actionText}>새로고침</Text>
          </Pressable>
        </View>

        {sections === null ? (
          <ActivityIndicator style={styles.loading} color={Colors.indigoText} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.rows.map(([label, value]) => (
                  <View key={label} style={styles.row}>
                    <Text style={styles.label}>{label}</Text>
                    <Text style={styles.value} selectable>{value}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ Colors, Role, Shadow }) => ({
  container: { flex: 1, backgroundColor: Colors.bgDefault, paddingTop: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  title: { fontSize: FontSize.heading, fontWeight: '700', color: Colors.slate800 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 8 },
  action: { backgroundColor: Colors.indigo600, borderRadius: Radius.pill, paddingVertical: 8, paddingHorizontal: 12, margin: 4 },
  actionText: { color: Colors.onColor, fontSize: FontSize.caption, fontWeight: '600' },
  loading: { marginTop: 40 },
  content: { padding: 16, paddingBottom: 48 },
  section: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: FontSize.label, fontWeight: '700', color: Colors.slate700, marginBottom: 6 },
  row: { flexDirection: 'row', paddingVertical: 4 },
  label: { width: 120, fontSize: FontSize.caption, color: Colors.slate500 },
  value: { flex: 1, fontSize: FontSize.caption, color: Colors.slate800 },
}));
