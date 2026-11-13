import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Cloud, CloudDrizzle, CloudRain, Droplets, Flame, Sun } from 'lucide-react-native';
import { Circle, Path, Svg } from 'react-native-svg';
import { Colors } from '../constants/colors';
import { FontSize, Radius } from '../constants/theme';
import type { WeatherSlot, WeatherType } from '../types';

interface WeatherTimelineProps {
  slots: WeatherSlot[];
  currentSlot: number;
}

const WEATHER_ICONS: Record<WeatherType, typeof Sun> = {
  sunny: Sun,
  cloudy: Cloud,
  rainy: CloudRain,
  drizzle: CloudDrizzle,
  hot: Flame,
};

function getSlotColors(slot: WeatherSlot, isCurrent: boolean): { bg: string; text: string } {
  // 지금 칸은 표시일 뿐 누르는 게 아니라서 남색이 아니라 진한 회색이다.
  if (isCurrent) return { bg: Colors.slate800, text: Colors.white };
  switch (slot.alert) {
    case 'rain':
      return { bg: Colors.sky50, text: Colors.sky600 };
    case 'cold':
      return { bg: Colors.blue50, text: Colors.blue600 };
    case 'heat':
      return { bg: Colors.orange50, text: Colors.orange600 };
    default:
      return { bg: Colors.slate50, text: Colors.slate600 };
  }
}

function getDotColor(slot: WeatherSlot, isCurrent: boolean, isPast: boolean): string {
  if (isCurrent) return Colors.slate800;
  if (isPast) return Colors.slate300;
  switch (slot.alert) {
    case 'rain':
      return Colors.sky400;
    case 'cold':
      return Colors.blue400;
    case 'heat':
      return Colors.orange400;
    default:
      return Colors.slate400;
  }
}

function buildPath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
}

export function WeatherTimeline({ slots, currentSlot }: WeatherTimelineProps) {
  // 강수/기온급강하 힌트 문구는 DashboardScreen이 WeatherService.getTimelineHint()로
  // 이미 상단 카드에 표시하고 있어서, 여기서 같은 판정을 다시 구현해 중복 표시하지 않는다.
  const temps = slots.map((s) => s.temp);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const range = maxTemp - minTemp || 1;
  const points = slots.map((s, i) => ({
    x: slots.length > 1 ? (i * 100) / (slots.length - 1) : 50,
    y: 24 - ((s.temp - minTemp) / range) * 20,
  }));

  const fullPath = buildPath(points);
  const pastPath = buildPath(points.slice(0, currentSlot + 1));
  const currentPoint = points[currentSlot];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>오늘 시간대별 날씨</Text>
        <Text style={styles.subtitle}>3시간 간격</Text>
      </View>

      <View style={styles.row}>
        {slots.map((slot, i) => {
          const isCurrent = i === currentSlot;
          const isPast = i < currentSlot;
          const colors = getSlotColors(slot, isCurrent);
          const WeatherIcon = WEATHER_ICONS[slot.type];

          return (
            <View
              key={`${slot.label}-${i}`}
              style={[
                styles.slot,
                { backgroundColor: colors.bg, opacity: isPast ? 0.5 : 1 },
                isCurrent && styles.slotCurrent,
              ]}
              // 칸 하나를 한 문장으로 읽게 한다 — 안 묶으면 "오전", "18도", "30퍼센트"가 따로 읽힌다.
              accessible
              accessibilityLabel={`${slot.label}${isCurrent ? ' (지금)' : ''}, ${slot.temp}도, 강수확률 ${slot.rain}%`}
            >
              <Text style={[styles.slotLabel, { color: colors.text }]}>{slot.label}</Text>
              <WeatherIcon size={18} color={colors.text} style={styles.slotIcon} />
              <Text style={[styles.slotTemp, { color: colors.text }]}>{slot.temp}°</Text>
              <View style={styles.slotRainRow}>
                <Droplets size={10} color={colors.text} />
                <Text style={[styles.slotRainText, { color: colors.text }]}>{slot.rain}%</Text>
              </View>
            </View>
          );
        })}
      </View>

      <Svg width="100%" height={28} viewBox="0 0 100 28">
        <Path d={fullPath} stroke={Colors.slate200} strokeWidth={1.5} fill="none" />
        <Path d={pastPath} stroke={Colors.slate500} strokeWidth={1.5} fill="none" />
        {currentPoint ? (
          <Circle cx={currentPoint.x} cy={currentPoint.y} r={5} fill={Colors.slate800} opacity={0.2} />
        ) : null}
        {points.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === currentSlot ? 2.2 : 1.6}
            fill={getDotColor(slots[i], i === currentSlot, i < currentSlot)}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // 날씨 영역 안에 들어가는 부분이라 자기 카드를 갖지 않는다.
  container: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.slate800,
  },
  subtitle: {
    fontSize: FontSize.caption,
    color: Colors.slate500,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    marginHorizontal: 2,
    borderRadius: Radius.md,
  },
  slotCurrent: {
    shadowColor: Colors.slate800,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  slotLabel: {
    fontSize: FontSize.caption,
    marginBottom: 4,
  },
  slotIcon: {
    marginBottom: 4,
  },
  slotTemp: {
    fontSize: FontSize.label,
    fontWeight: '600',
    marginBottom: 4,
  },
  slotRainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  slotRainText: {
    fontSize: FontSize.caption,
  },
});
