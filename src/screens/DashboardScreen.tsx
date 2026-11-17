import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ChevronRight, MapPin, Moon, Settings } from 'lucide-react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { detectPurposeFromEvents, findMatchingEvent } from '../constants/purposes';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { useAppStore } from '../store';
import { DirectionsService } from '../services/directions/DirectionsService';
import { buildSuggestions, type AiSuggestion } from '../services/ai/hints';
import { pickNextPlaceEvent } from '../utils/directions';
import { getAlertTime, parseEventTime } from '../utils/time';
import { AiSuggestionCard } from '../components/AiSuggestionCard';
import { Mascot } from '../components/Mascot';
import { PurposeSelector } from '../components/PurposeSelector';
import { Toast } from '../components/Toast';
import { TomorrowPreviewModal } from '../components/TomorrowPreviewModal';
import { Button } from '../components/ui';
import type { RootStackParamList } from '../navigation/AppNavigator';
import type { PurposeId } from '../types';
import { ChecklistCard } from './dashboard/ChecklistCard';
import { LeaveBar } from './dashboard/LeaveBar';
import { StatusRow } from './dashboard/StatusRow';
import { WeatherBlock } from './dashboard/WeatherBlock';
import { useDashboardData } from './dashboard/useDashboardData';

// 대시보드 — 화면의 뼈대만 여기 있고, 덩어리마다 screens/dashboard/ 아래 파일로 나뉘어 있다.
//   useDashboardData  일정·날씨 불러오기, 날짜 바뀜, 체크리스트 다시 조립
//   StatusRow         외출까지 남은 시간
//   WeatherBlock      날씨 요약과 자세히
//   ChecklistCard     체크리스트 (추가·음성·삭제)
//   LeaveBar          아래에 고정된 [떠나기]
export function DashboardScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Dashboard'>) {
  const { Role } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const scrollRef = useRef<ScrollView>(null);
  const checklistYRef = useRef(0);

  const { todayEvents, now, refreshing, refresh, usingFallbackLocation } = useDashboardData();

  const [leaveBarHeight, setLeaveBarHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [tomorrowVisible, setTomorrowVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const checklist = useAppStore((s) => s.checklist);
  const purposeId = useAppStore((s) => s.purposeId);
  const autoDetected = useAppStore((s) => s.autoDetected);
  const autoDetectedEvent = useAppStore((s) => s.autoDetectedEvent);
  const userSettings = useAppStore((s) => s.userSettings);
  const toast = useAppStore((s) => s.toast);
  const toastAction = useAppStore((s) => s.toastAction);
  const scrollToChecklistRequested = useAppStore((s) => s.scrollToChecklistRequested);
  const tomorrowPreviewRequested = useAppStore((s) => s.tomorrowPreviewRequested);
  const aiEnabled = useAppStore((s) => s.ai.enabled);
  const aiHintCache = useAppStore((s) => s.ai.hintCache);

  const setAutoDetected = useAppStore((s) => s.setAutoDetected);
  const buildChecklist = useAppStore((s) => s.buildChecklist);
  const setPurpose = useAppStore((s) => s.setPurpose);
  const showToast = useAppStore((s) => s.showToast);
  const clearToast = useAppStore((s) => s.clearToast);
  const clearScrollToChecklistRequest = useAppStore((s) => s.clearScrollToChecklistRequest);
  const clearTomorrowPreviewRequest = useAppStore((s) => s.clearTomorrowPreviewRequest);
  const acceptAiSuggestion = useAppStore((s) => s.acceptAiSuggestion);
  const rejectAiSuggestion = useAppStore((s) => s.rejectAiSuggestion);

  useEffect(() => {
    // 알림(출발 알림/긴급 알림) 본문을 탭해서 앱을 열었을 때 체크리스트로 스크롤한다.
    // checklistYRef는 체크리스트 카드의 onLayout에서 채워지는데, 콜드스타트 직후에는
    // 아직 레이아웃 측정 전일 수 있어서 한 프레임 미뤄서 실행한다.
    if (!scrollToChecklistRequested) return;

    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: checklistYRef.current, animated: true });
    });
    clearScrollToChecklistRequest();

    return () => cancelAnimationFrame(frame);
  }, [scrollToChecklistRequested, clearScrollToChecklistRequest]);

  // 자기 전 정리 알림을 눌러 들어온 경우 — 다음 외출 준비 화면을 연다
  useEffect(() => {
    if (!tomorrowPreviewRequested) return;
    setTomorrowVisible(true);
    clearTomorrowPreviewRequest();
  }, [tomorrowPreviewRequested, clearTomorrowPreviewRequest]);

  const handlePurposeSelect = (id: PurposeId | null) => {
    setPurpose(id);
    buildChecklist();
    scrollRef.current?.scrollTo({ y: checklistYRef.current, animated: true });
  };

  // 일정 기반 제안 — 캐시만 읽는다. 일정 제목은 화면 상태(todayEvents)에만 있고 저장되지 않는다.
  const aiSuggestions = useMemo(
    () =>
      aiEnabled
        ? buildSuggestions(
            todayEvents,
            userSettings.customKeywords,
            aiHintCache,
            checklist.map((item) => item.label)
          )
        : [],
    [aiEnabled, todayEvents, userSettings.customKeywords, aiHintCache, checklist]
  );

  const handleAcceptSuggestion = (suggestion: AiSuggestion) => {
    acceptAiSuggestion(suggestion);
    if (!suggestion.purposeId) return;

    // 방금 추가된 키워드로 목적 자동감지를 다시 돌린다. 사용자가 목적을 직접 고른
    // 상태면 덮어쓰지 않는다 — 자동감지가 수동 선택을 이기면 안 된다.
    showToast(`다음부터 '${suggestion.title}' 일정은 자동으로 인식해요.`);
    if (purposeId !== null && !autoDetected) return;
    const keywords = useAppStore.getState().userSettings.customKeywords;
    const detectedId = detectPurposeFromEvents(todayEvents, userSettings.departureTime, keywords);
    const matchedEvent = detectedId
      ? findMatchingEvent(detectedId, todayEvents, userSettings.departureTime, keywords)
      : null;
    setAutoDetected(detectedId, matchedEvent);
  };

  const alertTime = getAlertTime(userSettings.departureTime);
  const todayLabel = now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  // 현재 시각으로 다시 고른다 — 이미 시작한 일정은 길찾기 대상에서 빠진다.
  const nextPlaceEvent = pickNextPlaceEvent(todayEvents, parseEventTime(now.toISOString()));

  const handleOpenDirections = async () => {
    if (!nextPlaceEvent?.location) return;
    const opened = await DirectionsService.openPlace(userSettings.mapApp, nextPlaceEvent.location);
    if (!opened) showToast('지도를 열 수 없어요.');
  };

  return (
    <View style={styles.screen}>
      {/* 상태바·노치 높이는 기기마다 달라서 고정값 대신 안전 영역을 쓴다 */}
      <View style={[styles.header, { paddingTop: insets.top + Space.md }]}>
        <View style={styles.headerBrand}>
          <Mascot mood="logo" size={40} />
          <View>
            <Text style={styles.headerTitle} accessibilityRole="header">아맞다</Text>
            <Text style={styles.headerSubtitle}>{todayLabel}</Text>
          </View>
        </View>
        <Pressable
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="설정 열기"
        >
          <Settings size={22} color={Role.textSub} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        // 아래에 고정된 [떠나기] 뒤로 마지막 내용이 가려지지 않게 그 높이만큼 비운다.
        contentContainerStyle={[styles.scrollContent, { paddingBottom: leaveBarHeight + Space.xxl }]}
        // 키보드가 떠 있을 때도 첫 탭이 바로 먹게 — 없으면 "매일 루틴으로 추가"나 체크박스를
        // 누른 첫 탭이 키보드만 내리고 사라진다.
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Role.action} />}
      >
        <StatusRow now={now} />

        <WeatherBlock onRetry={refresh} usingFallbackLocation={usingFallbackLocation} />

        {nextPlaceEvent ? (
          <View style={[styles.lightRow, styles.sectionSpacing]}>
            <MapPin size={18} color={Role.textMuted} />
            <View style={styles.lightRowText}>
              <Text style={styles.lightRowTitle} numberOfLines={1}>
                {nextPlaceEvent.time} · {nextPlaceEvent.title}
              </Text>
              <Text style={styles.lightRowSub} numberOfLines={1}>
                {nextPlaceEvent.location}
              </Text>
            </View>
            <Button
              label="길찾기"
              variant="soft"
              size="sm"
              pill
              onPress={handleOpenDirections}
              accessibilityLabel={`${nextPlaceEvent.title} 길찾기`}
            />
          </View>
        ) : null}

        <View style={styles.sectionSpacing}>
          <PurposeSelector
            purposeId={purposeId}
            onSelect={handlePurposeSelect}
            autoDetected={autoDetected}
            autoDetectedEvent={autoDetectedEvent}
          />
        </View>

        <ChecklistCard
          onLayout={(e) => {
            checklistYRef.current = e.nativeEvent.layout.y;
          }}
        />

        {aiSuggestions.length > 0 ? (
          <View style={styles.sectionSpacing}>
            <AiSuggestionCard
              suggestions={aiSuggestions}
              onAccept={handleAcceptSuggestion}
              onReject={(s) => rejectAiSuggestion(s.key)}
            />
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.lightRow, styles.sectionSpacing, pressed && styles.pressed]}
          onPress={() => setTomorrowVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="다음 외출 준비 미리보기"
          accessibilityHint="그날 일정과 예보로 뜰 것을 보고, 그날만 챙길 것을 더해요"
        >
          <Moon size={18} color={Role.actionText} />
          <View style={styles.lightRowText}>
            <Text style={styles.lightRowTitle}>다음 외출 준비 미리보기</Text>
            <Text style={styles.lightRowSub}>그날 일정·예보로 뜰 것을 보고, 그날만 챙길 것을 더해요</Text>
          </View>
          <ChevronRight size={18} color={Role.actionText} />
        </Pressable>

        {/* 안내는 누르는 게 아니라서 면 없이 글로만 둔다. */}
        <View style={styles.notificationPreview}>
          <Text style={styles.notificationTitle}>이렇게 알려드려요</Text>
          {userSettings.alertPreference !== 'minimal' ? (
            <View style={styles.notificationRow}>
              <Text style={styles.notificationStep}>출발 30분 전 · {alertTime}</Text>
              <Text style={styles.notificationText}>잠금화면에 체크리스트가 떠요. 나갈 땐 [떠나기]를 눌러 마지막 확인.</Text>
            </View>
          ) : null}
          <View style={styles.notificationRow}>
            <Text style={styles.notificationStep}>현관 이탈 감지</Text>
            <Text style={styles.notificationText}>안 챙긴 채 나가면 바로 알려요.</Text>
          </View>
          <View style={styles.notificationRow}>
            <Text style={styles.notificationStep}>자기 전 정리 · {userSettings.nightlyCheckTime}</Text>
            <Text style={styles.notificationText}>오늘 착장 피드백을 남기고 다음 외출 준비를 봐요.</Text>
          </View>
        </View>
      </ScrollView>

      {/* 글자를 치는 동안에는 키보드 위로 올라와 입력창을 가리므로 숨긴다. */}
      {!keyboardVisible ? <LeaveBar onHeight={setLeaveBarHeight} /> : null}

      <TomorrowPreviewModal visible={tomorrowVisible} onClose={() => setTomorrowVisible(false)} />

      {/* 설정 화면이 위에 떠 있을 땐 그쪽이 토스트를 보여 준다. */}
      {toast && focused ? (
        <Toast
          message={toast}
          action={toastAction}
          onDone={clearToast}
          bottomOffset={keyboardVisible ? Space.lg : leaveBarHeight + Space.md}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ Role }) => ({
  screen: {
    flex: 1,
    backgroundColor: Role.bg,
  },
  pressed: {
    opacity: 0.8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.xl,
    paddingBottom: Space.md,
    backgroundColor: Role.bg,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  headerTitle: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: Role.text,
  },
  headerSubtitle: {
    fontSize: FontSize.label,
    color: Role.textMuted,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Space.xl,
  },
  sectionSpacing: {
    marginTop: Space.lg,
  },

  // 가벼운 줄 — 길찾기, 다음 외출 미리보기
  lightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: 56,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.lg,
    backgroundColor: Role.surfaceSoft,
  },
  lightRowText: {
    flex: 1,
  },
  lightRowTitle: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Role.text,
  },
  lightRowSub: {
    marginTop: 2,
    fontSize: FontSize.caption,
    lineHeight: 17,
    color: Role.textMuted,
  },

  // 알림 안내
  notificationPreview: {
    marginTop: Space.xxl,
    paddingHorizontal: Space.xs,
  },
  notificationTitle: {
    fontSize: FontSize.label,
    fontWeight: '700',
    color: Role.textStrong,
    marginBottom: Space.sm,
  },
  notificationRow: {
    marginBottom: Space.sm,
  },
  notificationStep: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: Role.textSub,
  },
  notificationText: {
    marginTop: 2,
    fontSize: FontSize.label,
    lineHeight: 18,
    color: Role.textMuted,
  },
}));
