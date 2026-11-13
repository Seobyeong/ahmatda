import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudRain,
  Droplets,
  Flame,
  Shirt,
  Sun,
  Wind,
} from 'lucide-react-native';
import type { Palette } from '../../constants/colors';
import { FEEDBACK_MESSAGES } from '../../constants/feedback';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../../constants/theme';
import { useAppStore } from '../../store';
import { WeatherService } from '../../services/weather/WeatherService';
import { calcPerceivedTemp, formatPerceivedFormula, formatTemp, getEffectiveDelta, getExposureAdjust } from '../../utils/temperature';
import { getCurrentSlotIndex, getFeedbackOutingDate } from '../../utils/time';
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
  hot: Flame,
};

function getWeatherIconColor(Colors: Palette, type: WeatherType): string {
  switch (type) {
    case 'sunny':
      return Colors.amber500;
    case 'rainy':
    case 'drizzle':
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

// 날씨 — 평소엔 요약 한 덩어리만 보인다. 계산 근거·시간대별 예보·피드백은 눌렀을 때 편다.
// 체크리스트가 화면 위쪽에 오도록 하기 위해서다.
export function WeatherBlock({ onRetry }: { onRetry: () => void }) {
  const { Colors, Role } = useTheme();
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);

  const currentWeather = useAppStore((s) => s.currentWeather);
  const weatherLoading = useAppStore((s) => s.weatherLoading);
  const weatherOutOfArea = useAppStore((s) => s.weatherOutOfArea);
  const weatherTimeline = useAppStore((s) => s.weatherTimeline);
  const userSettings = useAppStore((s) => s.userSettings);
  // 선택 표시는 store가 피드백을 붙이는 "가장 최근 외출" 기준 — 자기 전 정리 알림으로
  // 이미 답했으면 앱에서도 켜져 보여야 같은 외출에 두 번 답하지 않는다.
  const feedbackHistory = useAppStore((s) => s.feedbackHistory);
  const currentFeedback =
    feedbackHistory.find((r) => r.date === getFeedbackOutingDate(userSettings.departureTime))?.val ?? null;
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

  const perceivedFormula =
    currentWeather && perceivedTemp !== null
      ? formatPerceivedFormula(
          currentWeather.temp,
          currentWeather.humidity,
          currentWeather.wind,
          delta,
          perceivedTemp,
          exposureAdj
        )
      : null;

  const timelineHint = weatherTimeline.length > 0 ? WeatherService.getTimelineHint(weatherTimeline) : null;
  // 서비스가 주는 색은 밝은 화면용 고정값이라, 종류만 읽고 색은 테마에서 고른다.
  const hintIsRain = timelineHint?.bg === '#f0f9ff';

  const banners: string[] = [];
  if (currentWeather?.rainAlert) banners.push('오늘 비 예보가 있어요 — 우산을 챙기세요.');
  if (currentWeather?.heatAlert) banners.push('폭염 주의 — 물을 충분히 마시세요.');

  const WeatherIcon = WEATHER_ICONS[currentWeather?.weather ?? 'sunny'];

  return (
    <View style={[styles.block, { backgroundColor: getWeatherTint(Colors, currentWeather) }]}>
      {currentWeather && shownTemp !== null ? (
        <>
          <Pressable
            style={styles.summary}
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`내 위치 날씨 ${currentWeather.label}, 나에게 맞춘 체감온도 ${formatTemp(shownTemp)}`}
            accessibilityHint={expanded ? '자세한 날씨를 접어요' : '시간대별 예보와 계산 근거를 펴요'}
          >
            <WeatherIcon size={44} strokeWidth={1.75} color={getWeatherIconColor(Colors, currentWeather.weather)} />
            <View style={styles.summaryText}>
              <Text style={styles.caption}>나에게 맞춘 체감온도</Text>
              <Text style={styles.temp}>{formatTemp(shownTemp)}</Text>
              <Text style={styles.label}>내 위치 · {currentWeather.label}</Text>
            </View>
            <View style={styles.chevron}>
              {expanded ? (
                <ChevronUp size={20} color={Role.actionText} />
              ) : (
                <ChevronDown size={20} color={Role.actionText} />
              )}
            </View>
          </Pressable>

          <View style={styles.adviceRow}>
            <Shirt size={16} color={Role.textSub} />
            <Text style={styles.adviceText}>{currentWeather.recommendation}</Text>
          </View>

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

          {expanded ? (
            <View style={styles.detail}>
              {perceivedFormula ? (
                <View>
                  <Text style={styles.detailTitle}>체감온도 계산</Text>
                  <Text style={styles.detailText}>{perceivedFormula}</Text>
                </View>
              ) : null}

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
            </View>
          ) : null}
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

const useStyles = makeStyles(({ Colors, Role }) => ({
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
  detail: {
    marginTop: Space.lg,
    paddingTop: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.slate300,
    gap: Space.lg,
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
    backgroundColor: Role.surface,
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
