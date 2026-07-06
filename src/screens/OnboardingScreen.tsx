import React, { useEffect, useState } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import notifee from '@notifee/react-native';
import * as Location from 'expo-location';
import NetInfo, { NetInfoStateType } from '@react-native-community/netinfo';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlarmClock, Bell, Calendar, Check, MapPin } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { SENSITIVITY_DELTA } from '../constants/feedback';
import { useAppStore } from '../store';
import { CalendarService } from '../services/calendar/CalendarService';
import { NotificationService } from '../services/notification/NotificationService';
import { WifiMonitorService } from '../services/wifi/WifiMonitorService';
import { SensitivitySelector } from '../components/SensitivitySelector';
import { TimeInput } from '../components/TimeInput';
import type { RootStackParamList } from '../navigation/AppNavigator';

type OnboardingScreenProps = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

type PermissionState = 'idle' | 'granted' | 'denied';

interface PermissionRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: PermissionState;
  onRequest: () => void;
  deniedActionLabel?: string;
}

function PermissionRow({
  icon,
  title,
  description,
  status,
  onRequest,
  deniedActionLabel,
}: PermissionRowProps) {
  return (
    <View style={[styles.permissionRow, status === 'denied' && styles.permissionRowDenied]}>
      <View style={styles.permissionIcon}>{icon}</View>
      <View style={styles.permissionTextArea}>
        <Text style={styles.permissionTitle}>{title}</Text>
        <Text style={styles.permissionDescription}>{description}</Text>
        {status === 'denied' ? (
          <Text style={styles.permissionHint}>나중에 설정에서 허용 가능</Text>
        ) : null}
      </View>
      {status === 'granted' ? (
        <View style={styles.permissionGranted}>
          <Check size={16} color={Colors.emerald500} />
        </View>
      ) : (
        <Pressable style={styles.permissionButton} onPress={onRequest}>
          <Text style={styles.permissionButtonText}>
            {status === 'denied' && deniedActionLabel ? deniedActionLabel : '허용'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function OnboardingScreen(_props: OnboardingScreenProps) {
  const [step, setStep] = useState(0);
  const [permissions, setPermissions] = useState<{
    calendar: PermissionState;
    notification: PermissionState;
    location: PermissionState;
    exactAlarm: PermissionState;
  }>({ calendar: 'idle', notification: 'idle', location: 'idle', exactAlarm: 'idle' });

  const [sensitivity, setSensitivityValue] = useState<1 | 2 | 3 | 4 | 5>(3);

  const departureTimeDefault = useAppStore((s) => s.userSettings.departureTime);
  const [time, setTime] = useState(departureTimeDefault);
  const [bssid, setBssid] = useState('');
  const [wifiStatus, setWifiStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const setSensitivity = useAppStore((s) => s.setSensitivity);
  const updateDeltaOffset = useAppStore((s) => s.updateDeltaOffset);
  const updateDepartureTime = useAppStore((s) => s.updateDepartureTime);
  const setHomeBssid = useAppStore((s) => s.setHomeBssid);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  // 한 번 거부되면 OS가 앱 내 권한 다이얼로그를 다시 띄워주지 않으므로(iOS/Android 공통),
  // 이미 거부된 상태에서 다시 누르면 요청 대신 설정 화면으로 보낸다.
  const requestCalendarPermission = async () => {
    if (permissions.calendar === 'denied') {
      await CalendarService.openSettings();
      return;
    }
    const granted = await CalendarService.requestPermission();
    setPermissions((p) => ({ ...p, calendar: granted ? 'granted' : 'denied' }));
  };

  // 설정 화면에서 돌아왔을 때 최신 상태를 반영하기 위한 재조회
  const checkCalendarPermission = async () => {
    const status = await CalendarService.checkPermission();
    if (status === 'undetermined') return;  // 아직 한 번도 물어본 적 없으면 idle 유지
    setPermissions((p) => ({ ...p, calendar: status === 'authorized' ? 'granted' : 'denied' }));
  };

  // 한 번 거부되면 OS가 앱 내 재요청 다이얼로그를 다시 띄워주지 않으므로,
  // 이미 거부된 상태에서 다시 누르면 요청 대신 설정 화면으로 보낸다.
  const requestNotificationPermission = async () => {
    if (permissions.notification === 'denied') {
      await Linking.openSettings();
      return;
    }
    try {
      const settings = await notifee.requestPermission();
      setPermissions((p) => ({
        ...p,
        notification: settings.authorizationStatus >= 1 ? 'granted' : 'denied',
      }));
    } catch {
      setPermissions((p) => ({ ...p, notification: 'denied' }));
    }
  };

  // 설정 화면에서 돌아왔을 때 반영하기 위한 재조회. Android에서는 notifee가
  // "아직 한 번도 안 물어봄"과 "거부됨"을 구분해주지 않고 항상 DENIED로 응답하므로,
  // 허용된 경우만 승격시키고 그 외에는 현재 로컬 상태를 그대로 둔다(막 시작한
  // 사용자가 버튼을 누르기도 전에 거부 상태로 잘못 표시되는 것을 방지).
  const checkNotificationPermission = async () => {
    try {
      const settings = await notifee.getNotificationSettings();
      if (settings.authorizationStatus >= 1) {
        setPermissions((p) => ({ ...p, notification: 'granted' }));
      }
    } catch {
      // 조회 실패 시 현재 상태 유지
    }
  };

  const requestLocationPermission = async () => {
    if (permissions.location === 'denied') {
      await Linking.openSettings();
      return;
    }
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      setPermissions((p) => ({ ...p, location: result.granted ? 'granted' : 'denied' }));
    } catch {
      setPermissions((p) => ({ ...p, location: 'denied' }));
    }
  };

  // 설정 화면에서 돌아왔을 때 최신 상태를 반영하기 위한 재조회
  const checkLocationPermission = async () => {
    try {
      const result = await Location.getForegroundPermissionsAsync();
      if (result.status === 'undetermined') return; // 아직 한 번도 물어본 적 없으면 idle 유지
      setPermissions((p) => ({ ...p, location: result.granted ? 'granted' : 'denied' }));
    } catch {
      // 조회 실패 시 현재 상태 유지
    }
  };

  // 정확한 알람은 앱 안에서 직접 요청하는 권한이 아니라 시스템 설정 화면에서
  // 사용자가 켜야 하므로, 현재 상태를 조회해서 반영하는 방식으로 처리한다.
  const checkExactAlarmPermission = async () => {
    try {
      const granted = await NotificationService.isExactAlarmPermitted();
      setPermissions((p) => ({ ...p, exactAlarm: granted ? 'granted' : 'denied' }));
    } catch {
      // API 미지원 기기(구버전 Android, iOS)에서는 이 권한 자체가 필요 없다.
      setPermissions((p) => ({ ...p, exactAlarm: 'granted' }));
    }
  };

  const requestExactAlarmPermission = async () => {
    try {
      await NotificationService.openExactAlarmSettings();
    } catch {
      setPermissions((p) => ({ ...p, exactAlarm: 'denied' }));
    }
  };

  useEffect(() => {
    checkExactAlarmPermission();

    // 설정 화면에서 돌아왔을 때(포그라운드 복귀) 최신 상태를 다시 조회한다 —
    // openAlarmPermissionSettings()/openSettings()는 화면 전환만 시켜줄 뿐 결과를
    // 반환하지 않는다.
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkExactAlarmPermission();
        checkCalendarPermission();
        checkNotificationPermission();
        checkLocationPermission();
      }
    });
    return () => subscription.remove();
  }, []);

  const registerCurrentWifi = async () => {
    try {
      const state = await NetInfo.fetch();
      if (state.type === NetInfoStateType.wifi && state.details.bssid) {
        setBssid(state.details.bssid);
        setWifiStatus('success');
      } else {
        setWifiStatus('error');
      }
    } catch {
      setWifiStatus('error');
    }
  };

  const handleSensitivityNext = () => {
    setSensitivity(sensitivity);
    updateDeltaOffset(SENSITIVITY_DELTA[sensitivity]);
    setStep(2);
  };

  const handleStart = () => {
    updateDepartureTime(time);
    if (bssid) {
      setHomeBssid(bssid);
      // WifiMonitorService는 스토어와 별개로 AsyncStorage에 자체 BSSID를 저장하므로
      // 여기서 함께 등록해야 이탈 감지 모니터링이 실제로 동작한다.
      WifiMonitorService.registerHomeBssid(bssid);
    }
    // AppNavigator가 userSettings.onboarded 값을 구독해 Dashboard 화면으로
    // 자동 전환하므로, 여기서 navigation.replace를 별도로 호출하지 않는다.
    completeOnboarding();
  };

  const delta = SENSITIVITY_DELTA[sensitivity];
  const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
  const locationGranted = permissions.location === 'granted';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {step === 0 ? (
        <View>
          <View style={styles.introArea}>
            <Text style={styles.introEmoji}>🌦️</Text>
            <Text style={styles.introText}>
              날씨와 일정에 맞춰{'\n'}오늘 챙길 것들을 알려드려요.
            </Text>
            <Text style={styles.introSubtext}>몇 가지 권한만 허용하면 바로 시작할 수 있어요.</Text>
          </View>

          <PermissionRow
            icon={<Calendar size={20} color={Colors.indigo600} />}
            title="📅 캘린더"
            description="일정에서 목적과 준비물을 자동으로 파악해요"
            status={permissions.calendar}
            onRequest={requestCalendarPermission}
            deniedActionLabel="설정에서 허용"
          />
          <PermissionRow
            icon={<Bell size={20} color={Colors.indigo600} />}
            title="🔔 알림"
            description="외출 전 체크리스트와 피드백 알림을 받아요"
            status={permissions.notification}
            onRequest={requestNotificationPermission}
            deniedActionLabel="설정에서 허용"
          />
          <PermissionRow
            icon={<MapPin size={20} color={Colors.indigo600} />}
            title="📍 위치"
            description="집 Wi-Fi를 등록하고 외출을 감지해요"
            status={permissions.location}
            onRequest={requestLocationPermission}
            deniedActionLabel="설정에서 허용"
          />
          <PermissionRow
            icon={<AlarmClock size={20} color={Colors.indigo600} />}
            title="⏰ 정확한 알람"
            description="출발 알림이 정확한 시각에 오도록 허용해요"
            status={permissions.exactAlarm}
            onRequest={requestExactAlarmPermission}
          />

          <Pressable style={styles.primaryButton} onPress={() => setStep(1)}>
            <Text style={styles.primaryButtonText}>다음</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 1 ? (
        <View>
          <Text style={styles.title}>체온 민감도 설정</Text>
          <Text style={styles.description}>
            나의 더위/추위 민감도를 선택하면 착장 추천이 더 정확해져요.
          </Text>

          <SensitivitySelector value={sensitivity} onChange={setSensitivityValue} />

          <View style={styles.infoBox}>
            <Text style={styles.infoBoxText}>초기 보정치 Δt = {deltaLabel}°C로 설정됩니다</Text>
          </View>

          <Pressable style={styles.primaryButton} onPress={handleSensitivityNext}>
            <Text style={styles.primaryButtonText}>다음</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 2 ? (
        <View>
          <Text style={styles.title}>외출 시간을 설정해주세요</Text>
          <TimeInput value={time} onChange={setTime} />

          <View style={styles.divider} />

          <Text style={styles.title}>집 Wi-Fi를 등록해주세요</Text>

          <Pressable
            style={[styles.primaryButton, !locationGranted && styles.primaryButtonDisabled]}
            onPress={registerCurrentWifi}
            disabled={!locationGranted}
          >
            <Text style={styles.primaryButtonText}>
              {locationGranted ? '지금 연결된 Wi-Fi를 집으로 등록' : '위치 권한 필요'}
            </Text>
          </Pressable>

          {wifiStatus === 'success' ? (
            <Text style={styles.wifiSuccessText}>등록됨 · {bssid}</Text>
          ) : null}
          {wifiStatus === 'error' ? (
            <Text style={styles.wifiErrorText}>Wi-Fi 정보를 가져오지 못했어요. 직접 입력해주세요.</Text>
          ) : null}

          <TextInput
            style={styles.bssidInput}
            value={bssid}
            onChangeText={(value) => {
              setBssid(value);
              setWifiStatus('idle');
            }}
            placeholder="BSSID 직접 입력 (선택 사항)"
            placeholderTextColor={Colors.slate400}
          />

          <Pressable style={styles.primaryButton} onPress={handleStart}>
            <Text style={styles.primaryButtonText}>시작하기</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgDefault,
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 60,
  },
  introArea: {
    alignItems: 'center',
    marginBottom: 28,
  },
  introEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  introText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.slate800,
    textAlign: 'center',
    lineHeight: 26,
  },
  introSubtext: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.slate500,
    textAlign: 'center',
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  permissionRowDenied: {
    opacity: 0.5,
  },
  permissionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.indigo50,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  permissionTextArea: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.slate800,
  },
  permissionDescription: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.slate500,
  },
  permissionHint: {
    marginTop: 2,
    fontSize: 11,
    color: Colors.slate400,
  },
  permissionButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 50,
    backgroundColor: Colors.indigo600,
  },
  permissionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.white,
  },
  permissionGranted: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.emerald100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: Colors.indigo600,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: Colors.slate300,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.slate800,
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    color: Colors.slate500,
    marginBottom: 24,
    lineHeight: 20,
  },
  infoBox: {
    marginTop: 20,
    backgroundColor: Colors.indigo50,
    borderRadius: 12,
    padding: 14,
  },
  infoBoxText: {
    fontSize: 13,
    color: Colors.indigo600,
    fontWeight: '500',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.slate200,
    marginVertical: 24,
  },
  wifiSuccessText: {
    marginTop: 10,
    fontSize: 12,
    color: Colors.emerald600,
    fontWeight: '500',
  },
  wifiErrorText: {
    marginTop: 10,
    fontSize: 12,
    color: Colors.red500,
  },
  bssidInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.slate200,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 13,
    color: Colors.slate800,
    backgroundColor: Colors.white,
  },
});
