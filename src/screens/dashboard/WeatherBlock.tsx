import React, { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronRight,
  Cloud,
  CloudDrizzle, CloudSnow,
  CloudFog,
  CloudRain,
  Droplets,
  Flame,
  Shirt,
  Sun,
  Wind,
  X,
} from 'lucide-react-native';
import type { Palette } from '../../constants/colors';
import { FEEDBACK_MESSAGES } from '../../constants/feedback';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../../constants/theme';
import { scheduleOf, useAppStore } from '../../store';
import { WeatherService } from '../../services/weather/WeatherService';
import { calcPerceivedTemp, explainPerceived, formatTemp, getEffectiveDelta, getExposureAdjust } from '../../utils/temperature';
import { getCurrentSlotIndex } from '../../utils/time';
import { feedbackOutingDate } from '../../utils/schedule';
import { Mascot } from '../../components/Mascot';
import { WeatherTimeline } from '../../components/WeatherTimeline';
import { Button } from '../../components/ui';
import type { CurrentWeather, FeedbackType, WeatherType } from '../../types';

const FEEDBACK_OPTIONS: { val: FeedbackType; label: string }[] = [
  { val: 'cold', label: '추웠음' },
  { val: 'good', label: '적당함' },
  { val: 'hot', label: '더웠음' },
];

const WEATHER_ICONS: Record<WeatherType, typeof Sun> = {
  sunny: Sun,
  cloudy: Cloud,
  rainy: CloudRain,
  drizzle: CloudDrizzle,
  snowy: CloudSnow,
  hot: Flame,
};

function getWeatherIconColor(Colors: Palette, type: WeatherType): string {
  switch (type) {
    case 'sunny':
      return Colors.amber500;
    case 'rainy':
    case 'drizzle':
    case 'snowy':
      return Colors.sky500;
    case 'hot':
      return Colors.orange600;
    default:
      return Colors.slate500;
  }
}

// 날씨 영역의 바탕 — 비·폭염일 때만 색을 입혀 평소와 다른 날임을 알린다.
function getWeatherTint(Colors: Palette, weather: CurrentWeather | null): string {
  if (weather?.rainAlert) return Colors.sky50;
  if (weather?.heatAlert) return Colors.orange50;
  return Colors.slate100;
}

// 날씨 — 평소엔 요약 한 덩어리, 안 챙긴 게 남아 있으면 한 줄로 줄인다 (2026-11-28 — 체크리스트가 화면 위쪽에
// 오게). 비·폭염 안내는 줄여도 남긴다. 눌러서 여는 바텀시트에 이유(문장)·시간대별 예보·옷차림 피드백이 있다.
export function WeatherBlock({
  onRetry,
  usingFallbackLocation,
}: {
  onRetry: () => void;
  // 위치를 못 잡아 서울시청 좌표로 받은 날씨면 "내 위치"라고 쓰지 않는다.
  usingFallbackLocation: boolean;
}) {
  const { Colors, Role } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  // 안 챙긴 게 남아 있으면 한 줄 — 지금 할 일은 체크리스트다. 단 체크할 때마다 바꾸면 날씨 높이가 변해
  // 아래 체크리스트가 위아래로 튄다 (다음 탭이 다른 줄에 간다). 화면에 들어올 때·앱으로 돌아올 때·목록이
  // 새로 조립될 때(날짜·목적)만 다시 정한다.
  const hasUnchecked = () => useAppStore.getState().checklist.some((i) => !i.checked);
  const [compact, setCompact] = useState(hasUnchecked);
  const focused = useIsFocused();
  const checklistDate = useAppStore((s) => s.checklistDate);
  const purposeId = useAppStore((s) => s.purposeId);
  useEffect(() => {
    if (focused) setCompact(hasUnchecked());
  }, [focused, checklistDate, purposeId]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setCompact(hasUnchecked());
    });
    return () => sub.remove();
  }, []);

  const currentWeather = useAppStore((s) => s.currentWeather);
  useEffect(() => {
    if (!currentWeather) setSheetOpen(false);
  }, [currentWeather]);
  const weatherLoading = useAppStore((s) => s.weatherLoading);
  const weatherOutOfArea = useAppStore((s) => s.weatherOutOfArea);
  const weatherTimeline = useAppStore((s) => s.weatherTimeline);
  const userSettings = useAppStore((s) => s.userSettings);
  // 피드백이 가리키는 외출 날 — 일정(오늘만 바꾼 것 포함)이 바뀌면 다시 그린다.
  const scheduleJson = useAppStore((s) => JSON.stringify(scheduleOf(s)));
  // 선택 표시는 store가 피드백을 붙이는 "가장 최근 외출" 기준 — 자기 전 정리 알림으로
  // 이미 답했으면 앱에서도 켜져 보여야 같은 외출에 두 번 답하지 않는다.
  const feedbackHistory = useAppStore((s) => s.feedbackHistory);
  const currentFeedback =
    feedbackHistory.find((r) => r.date === feedbackOutingDate(JSON.parse(scheduleJson), new Date()))?.val ?? null;
  const applyFeedback = useAppStore((s) => s.applyFeedback);
  const showToast = useAppStore((s) => s.showToast);

  const handleFeedback = (val: FeedbackType) => {
    applyFeedback(val);
    showToast(FEEDBACK_MESSAGES[val]);
  };

  const delta = getEffectiveDelta(userSettings.sensitivityLevel, userSettings.learnedDelta);
  const basePerceived = currentWeather
    ? calcPerceivedTemp(currentWeather.temp, currentWeather.humidity, currentWeather.wind, delta)
    : null;
  const exposureAdj = basePerceived !== null ? getExposureAdjust(basePerceived, userSettings.commuteMode) : 0;
  const perceivedTemp = basePerceived !== null ? basePerceived + exposureAdj : null;
  const shownTemp = currentWeather ? perceivedTemp ?? currentWeather.temp : null;

  const reasons =
    currentWeather && perceivedTemp !== null
      ? explainPerceived(currentWeather.temp, currentWeather.humidity, currentWeather.wind, delta, exposureAdj)
      : [];

  const timelineHint = weatherTimeline.length > 0 ? WeatherService.getTimelineHint(weatherTimeline) : null;
  // 서비스가 주는 색은 밝은 화면용 고정값이라, 종류만 읽고 색은 테마에서 고른다.
  const hintIsRain = timelineHint?.bg === '#f0f9ff';

  const banners: string[] = [];
  if (currentWeather?.rainAlert) banners.push(`지금 ${currentWeather.snowNow ? '눈이' : '비가'} 와요 — 우산을 챙기세요.`);
  if (currentWeather?.heatAlert) banners.push('폭염 주의 — 물을 충분히 마시세요.');

  const WeatherIcon = WEATHER_ICONS[currentWeather?.weather ?? 'sunny'];
  const placeLabel = usingFallbackLocation ? '서울 (위치 확인 안 됨)' : '내 위치';

  return (
    <View style={[styles.block, { backgroundColor: getWeatherTint(Colors, currentWeather) }]}>
      {currentWeather && shownTemp !== null ? (
        <>
          {compact ? (
            <Pressable
              style={styles.compactRow}
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`${placeLabel} 날씨 ${currentWeather.label}, 체감 ${formatTemp(shownTemp)}. ${currentWeather.recommendation}`}
              accessibilityHint="자세한 날씨를 열어요"
            >
              <WeatherIcon size={24} strokeWidth={1.75} color={getWeatherIconColor(Colors, currentWeather.weather)} />
              <View style={styles.summaryText}>
                <View style={styles.compactTop}>
                  <Text style={styles.compactTemp}>체감 {formatTemp(shownTemp)}</Text>
                  <Text style={styles.compactLabel} numberOfLines={1}>{currentWeather.label} · {placeLabel}</Text>
                </View>
                {/* 옷차림은 나가기 직전에 필요하다 — 줄여도 한 줄은 남긴다 */}
                <Text style={styles.compactAdvice} numberOfLines={1}>{currentWeather.recommendation}</Text>
              </View>
              <ChevronRight size={18} color={Role.actionText} />
            </Pressable>
          ) : (
            <>
              <Pressable
                style={styles.summary}
                onPress={() => setSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`${placeLabel} 날씨 ${currentWeather.label}, 나에게 맞춘 체감온도 ${formatTemp(shownTemp)}`}
                accessibilityHint="시간대별 예보와 체감온도 이유를 열어요"
              >
                <WeatherIcon size={44} strokeWidth={1.75} color={getWeatherIconColor(Colors, currentWeather.weather)} />
                <View style={styles.summaryText}>
                  <Text style={styles.caption}>나에게 맞춘 체감온도</Text>
                  <Text style={styles.temp}>{formatTemp(shownTemp)}</Text>
                  <Text style={styles.label}>{placeLabel} · {currentWeather.label}</Text>
                </View>
                <View style={styles.chevron}>
                  <ChevronRight size={20} color={Role.actionText} />
                </View>
              </Pressable>

              <View style={styles.adviceRow}>
                <Shirt size={16} color={Role.textSub} />
                <Text style={styles.adviceText}>{currentWeather.recommendation}</Text>
              </View>
            </>
          )}

          {banners.map((banner, i) => (
            <View key={i} style={styles.alertBanner}>
              <Text style={styles.alertBannerText}>{banner}</Text>
            </View>
          ))}

          {timelineHint ? (
            <View style={[styles.alertBanner, { backgroundColor: hintIsRain ? Colors.sky50 : Colors.blue50 }]}>
              <Text style={[styles.alertBannerText, { color: hintIsRain ? Colors.sky600 : Colors.blue600 }]}>
                {timelineHint.text}
              </Text>
            </View>
          ) : null}

          <Modal
            // 날씨가 비었다가(자정 넘김) 다시 오면 저절로 열리지 않게 — 닫힌 것으로 본다
            visible={sheetOpen}
            animationType="slide"
            transparent
            statusBarTranslucent
            navigationBarTranslucent
            onRequestClose={() => setSheetOpen(false)}
          >
            <View style={styles.backdrop}>
              <Pressable style={styles.dismissArea} onPress={() => setSheetOpen(false)} accessibilityLabel="닫기" />
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <WeatherIcon size={28} strokeWidth={1.75} color={getWeatherIconColor(Colors, currentWeather.weather)} />
                  <View style={styles.summaryText}>
                    <Text style={styles.sheetTitle} accessibilityRole="header">체감 {formatTemp(shownTemp)} · {currentWeather.label}</Text>
                    <Text style={styles.label}>{placeLabel} · {currentWeather.recommendation}</Text>
                  </View>
                  <Pressable onPress={() => setSheetOpen(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기">
                    <X size={20} color={Role.textMuted} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={[styles.detail, { paddingBottom: insets.bottom + 32 }]}>
                  <View>
                    <Text style={styles.detailTitle}>왜 {formatTemp(shownTemp)}인가요?</Text>
                    {reasons.map((line) => (
                      <Text key={line} style={styles.reasonText}>{line}</Text>
                    ))}
                  </View>

                  <View style={styles.envStrip}>
                    <View style={styles.envCell}>
                      <CloudFog size={18} color={Role.textMuted} />
                      <Text style={styles.envValue}>{currentWeather.dustLevel}</Text>
                      <Text style={styles.envLabel}>미세먼지</Text>
                    </View>
                    <View style={styles.envCell}>
                      <Droplets size={18} color={Role.textMuted} />
                      <Text style={styles.envValue}>{currentWeather.humidity}%</Text>
                      <Text style={styles.envLabel}>습도</Text>
                    </View>
                    <View style={styles.envCell}>
                      <Wind size={18} color={Role.textMuted} />
                      <Text style={styles.envValue}>{currentWeather.wind}m/s</Text>
                      <Text style={styles.envLabel}>바람</Text>
                    </View>
                  </View>

                  {weatherTimeline.length > 0 ? (
                    <WeatherTimeline slots={weatherTimeline} currentSlot={getCurrentSlotIndex()} />
                  ) : null}

                  {/* 버튼만 있으면 무엇을 묻는지 알 수 없다 — 무엇에 대한 답이고 왜 묻는지 한 줄로 알린다. */}
                  <View>
                    <Text style={styles.detailTitle}>최근 외출 때 옷차림은 어땠나요?</Text>
                    <Text style={styles.detailText}>답할수록 체감온도가 나에게 맞춰져요.</Text>
                    <View style={styles.feedbackRow} accessibilityRole="radiogroup">
                      {FEEDBACK_OPTIONS.map((opt) => (
                        <Pressable
                          key={opt.val}
                          style={[styles.feedbackChip, currentFeedback === opt.val && styles.feedbackChipActive]}
                          onPress={() => handleFeedback(opt.val)}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: currentFeedback === opt.val }}
                          accessibilityLabel={`옷차림 ${opt.label}`}
                        >
                          <Text
                            style={[styles.feedbackChipText, currentFeedback === opt.val && styles.feedbackChipTextActive]}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        </>
      ) : (
        <View style={styles.stateRow}>
          <Mascot mood={weatherLoading && !weatherOutOfArea ? 'idle' : 'sorry'} size={56} />
          <View style={styles.stateTextArea}>
            {weatherOutOfArea ? (
              <Text style={styles.stateText}>
                기상청 API는 국내 전용이에요 — 해외에서는 날씨 정보를 제공할 수 없어요.
              </Text>
            ) : weatherLoading ? (
              <Text style={styles.stateText}>날씨 정보를 불러오는 중...</Text>
            ) : (
              <>
                <Text style={styles.stateText}>날씨 정보를 가져오지 못했어요.</Text>
                <Button label="다시 시도" variant="soft" size="sm" pill onPress={onRetry} style={styles.stateButton} />
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ Role }) => ({
  block: {
    borderRadius: Radius.lg,
    padding: Space.lg,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
  },
  summaryText: {
    flex: 1,
  },
  caption: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Role.textSub,
  },
  temp: {
    fontSize: FontSize.display,
    lineHeight: 46,
    fontWeight: '800',
    color: Role.text,
  },
  label: {
    fontSize: FontSize.label,
    color: Role.textSub,
  },
  chevron: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Space.sm,
  },
  adviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.md,
  },
  adviceText: {
    flex: 1,
    fontSize: FontSize.body,
    lineHeight: 21,
    color: Role.textStrong,
  },
  alertBanner: {
    marginTop: Space.sm,
    backgroundColor: Role.surface,
    borderRadius: Radius.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  alertBannerText: {
    fontSize: FontSize.label,
    lineHeight: 18,
    fontWeight: '600',
    color: Role.textStrong,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: 44,
  },
  compactTemp: {
    fontSize: FontSize.heading,
    fontWeight: '800',
    color: Role.text,
  },
  compactTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
  },
  compactLabel: {
    flex: 1,
    fontSize: FontSize.label,
    color: Role.textSub,
  },
  compactAdvice: {
    fontSize: FontSize.label,
    color: Role.textStrong,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: Role.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.xl,
    paddingTop: 18,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingBottom: Space.md,
  },
  sheetTitle: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.text,
  },
  detail: {
    gap: Space.lg,
    paddingBottom: 32,
  },
  reasonText: {
    marginTop: 4,
    fontSize: FontSize.body,
    lineHeight: 21,
    color: Role.textStrong,
  },
  detailTitle: {
    fontSize: FontSize.label,
    fontWeight: '700',
    color: Role.textStrong,
  },
  detailText: {
    marginTop: 2,
    fontSize: FontSize.caption,
    lineHeight: 17,
    color: Role.textSub,
  },
  envStrip: {
    flexDirection: 'row',
  },
  envCell: {
    flex: 1,
    alignItems: 'center',
  },
  envValue: {
    marginTop: 6,
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Role.text,
  },
  envLabel: {
    marginTop: 2,
    fontSize: FontSize.caption,
    color: Role.textMuted,
  },
  feedbackRow: {
    flexDirection: 'row',
    marginTop: Space.sm,
    gap: Space.sm,
  },
  feedbackChip: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
    // 시트 면(surface) 위라 한 단계 옅은 면으로 구분한다
    backgroundColor: Role.surfaceSoft,
  },
  feedbackChipActive: {
    backgroundColor: Role.action,
  },
  feedbackChipText: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Role.actionText,
  },
  feedbackChipTextActive: {
    color: Role.onAction,
  },
  // 상태 (불러오는 중·실패) — 캐릭터 + 한 줄
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  stateTextArea: {
    flex: 1,
  },
  stateText: {
    fontSize: FontSize.body,
    lineHeight: 21,
    color: Role.textSub,
  },
  stateButton: {
    alignSelf: 'flex-start',
    marginTop: Space.sm,
  },
}));
