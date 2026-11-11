import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Briefcase,
  Check,
  Circle,
  CircleCheck,
  CreditCard,
  Droplets,
  Headphones,
  Heart,
  Key,
  Pencil,
  Shirt,
  Sparkles,
  Umbrella,
  Wallet,
  Wind,
  X,
  Zap,
} from 'lucide-react-native';
import { Colors } from '../constants/colors';
import type { ChecklistItem as ChecklistItemType } from '../types';

interface ChecklistItemProps {
  item: ChecklistItemType;
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  purposeColor?: string;
}

const ICONS: Record<string, typeof Check> = {
  umbrella: Umbrella,
  wind: Wind,
  droplets: Droplets,
  key: Key,
  wallet: Wallet,
  headphones: Headphones,
  briefcase: Briefcase,
  card: CreditCard,
  zap: Zap,
  pencil: Pencil,
  sparkles: Sparkles,
  heart: Heart,
  shirt: Shirt,
  'check-circle': CircleCheck,
};

function getTierColor(tier: ChecklistItemType['tier'], purposeColor?: string): string {
  switch (tier) {
    case 1:
      return Colors.sky500;
    case 2:
      return purposeColor ?? Colors.violet600;
    case 3:
      return Colors.slate400;
    default:
      return Colors.slate500;
  }
}

// memo: 항목 하나를 체크하면 store가 그 항목 객체만 새로 만들고 나머지는 참조를 유지한다.
// onToggle/onDelete는 store 액션이라 참조가 고정이어서, 바뀐 한 줄만 다시 그려진다.
export const ChecklistItem = React.memo(function ChecklistItem({ item, onToggle, onDelete, purposeColor }: ChecklistItemProps) {
  // 체크 반응성이 이 앱의 핵심 사용성 요건이라, 탭하면 상태를 바로 바꾸고(딜레이 없음)
  // 옅어지는 효과는 그 위에 얹는 순수 시각 효과로만 재생한다. 예전엔 슬라이드+페이드
  // 애니메이션이 끝난 뒤에야 실제 토글이 일어나서 체크할 때마다 220ms 딜레이가 있었다.
  const opacity = useRef(new Animated.Value(item.checked ? 0.4 : 1)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: item.checked ? 0.4 : 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [item.checked, opacity]);

  const handlePress = () => {
    onToggle(item.id);
  };

  const Icon = ICONS[item.icon] ?? Circle;
  const iconColor = getTierColor(item.tier, purposeColor);
  const showDelete = item.temp || item.permanent || item.tier === 1 || item.tier === 2;

  return (
    <Animated.View style={[styles.wrapper, { opacity }]}>
      <Pressable
        style={styles.row}
        onPress={handlePress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={item.badge ? `${item.label}, ${item.badge}` : item.label}
      >
        <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
          {item.checked && <Check size={14} color={Colors.white} />}
        </View>

        <Icon size={18} color={iconColor} style={styles.icon} />

        <View style={styles.textArea}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, item.checked && styles.labelChecked]}>
              {item.label}
            </Text>
            {item.tier !== 0 && item.note ? (
              <Text style={styles.note}>{item.note}</Text>
            ) : null}
            {item.tier === 0 ? (
              <View style={styles.tempPill}>
                <Text style={styles.tempPillText}>오늘만</Text>
              </View>
            ) : null}
          </View>
          {item.badge ? <Text style={styles.badge}>{item.badge}</Text> : null}
        </View>
      </Pressable>

      {showDelete ? (
        <Pressable
          style={styles.deleteButton}
          onPress={() => onDelete?.(item.id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${item.label} 삭제`}
        >
          <X size={16} color={Colors.slate400} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.slate300,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: Colors.indigo600,
    borderColor: Colors.indigo600,
  },
  icon: {
    marginRight: 10,
  },
  textArea: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 15,
    color: Colors.slate800,
    fontWeight: '500',
  },
  labelChecked: {
    textDecorationLine: 'line-through',
    color: Colors.slate500,
  },
  note: {
    marginLeft: 6,
    fontSize: 12,
    color: Colors.slate400,
  },
  tempPill: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 50,
    backgroundColor: Colors.slate100,
  },
  tempPillText: {
    fontSize: 10,
    color: Colors.slate500,
  },
  badge: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.indigo600,
  },
  deleteButton: {
    padding: 6,
    marginLeft: 4,
  },
});
