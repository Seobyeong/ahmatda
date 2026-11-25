import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
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
import { FontSize, Radius, makeStyles, useTheme } from '../constants/theme';
import type { Palette } from '../constants/colors';
import type { ChecklistItem as ChecklistItemType } from '../types';

interface ChecklistItemProps {
  item: ChecklistItemType;
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
  // 길게 누르기 — 항목 속성(꼭 챙김) 시트를 연다
  onOpenOptions?: (id: string) => void;
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

// 챙긴 항목은 옅게 — 0.4면 글자가 거의 안 읽혀서(대비 2:1 미만) 다시 확인하기 어렵다.
const CHECKED_OPACITY = 0.55;

// 지웠을 때 벌어지는 일이 분류마다 달라서 화면 낭독기에 미리 알린다.
function getDeleteHint(item: ChecklistItemType): string {
  if (item.temp) return '오늘 목록에서 지워요';
  if (item.permanent) return item.onDate ? '이 날만 챙기는 항목을 지워요' : '매일 루틴에서도 지워요';
  return '앞으로 이 항목을 추천하지 않아요';
}

function getTierColor(Colors: Palette, tier: ChecklistItemType['tier'], purposeColor?: string): string {
  switch (tier) {
    case 1:
      return Colors.sky500;
    case 2:
      return purposeColor ?? Colors.violet600;
    case 3:
      return Colors.slate500;
    default:
      return Colors.slate500;
  }
}

// memo: 항목 하나를 체크하면 store가 그 항목 객체만 새로 만들고 나머지는 참조를 유지한다.
// onToggle/onDelete는 store 액션이라 참조가 고정이어서, 바뀐 한 줄만 다시 그려진다.
export const ChecklistItem = React.memo(function ChecklistItem({ item, onToggle, onDelete, onOpenOptions, purposeColor }: ChecklistItemProps) {
  const { Colors } = useTheme();
  const styles = useStyles();
  // 체크 반응성이 이 앱의 핵심 사용성 요건이라, 탭하면 상태를 바로 바꾸고(딜레이 없음)
  // 옅어지는 효과는 그 위에 얹는 순수 시각 효과로만 재생한다. 예전엔 슬라이드+페이드
  // 애니메이션이 끝난 뒤에야 실제 토글이 일어나서 체크할 때마다 220ms 딜레이가 있었다.
  const opacity = useRef(new Animated.Value(item.checked ? CHECKED_OPACITY : 1)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: item.checked ? CHECKED_OPACITY : 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [item.checked, opacity]);

  const handlePress = () => {
    onToggle(item.id);
  };

  const Icon = ICONS[item.icon] ?? Circle;
  const iconColor = getTierColor(Colors, item.tier, purposeColor);
  const showDelete = item.temp || item.permanent || item.tier === 1 || item.tier === 2;

  return (
    <Animated.View style={[styles.wrapper, { opacity }]}>
      <Pressable
        style={styles.row}
        onPress={handlePress}
        onLongPress={onOpenOptions ? () => onOpenOptions(item.id) : undefined}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={[item.label, item.essential ? '꼭 챙김' : null, item.tier !== 0 ? item.note : null, item.badge].filter(Boolean).join(', ')}
        // 화면 낭독기에서는 길게 누르기를 찾기 어렵다 — 동작 목록에 넣는다
        accessibilityActions={onOpenOptions ? [{ name: 'longpress', label: '꼭 챙김 정하기' }] : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'longpress') onOpenOptions?.(item.id);
        }}
      >
        <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
          {item.checked && <Check size={14} color={Colors.onColor} />}
        </View>

        <Icon size={18} color={iconColor} style={styles.icon} />

        <View style={styles.textArea}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, item.checked && styles.labelChecked]}>
              {item.label}
            </Text>
            {item.essential ? (
              <View style={styles.essentialPill}>
                <Text style={styles.essentialPillText}>꼭</Text>
              </View>
            ) : null}
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
          accessibilityRole="button"
          accessibilityLabel={`${item.label} 삭제`}
          accessibilityHint={getDeleteHint(item)}
        >
          <X size={18} color={Colors.slate500} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
});

const useStyles = makeStyles(({ Colors, Role, Shadow }) => ({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
  },
  // 줄 전체가 체크 버튼이다 — 높이 48 이상이라 걸어가면서 엄지로 눌러도 빗나가지 않는다.
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: Colors.slate400,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    // 챙긴 것은 초록 — 남색은 누를 수 있는 것에만 쓴다.
    backgroundColor: Colors.emerald600,
    borderColor: Colors.emerald600,
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
    fontSize: FontSize.heading,
    color: Colors.slate800,
    fontWeight: '500',
  },
  labelChecked: {
    textDecorationLine: 'line-through',
    color: Colors.slate500,
  },
  note: {
    marginLeft: 6,
    fontSize: FontSize.caption,
    color: Colors.slate500,
  },
  // 꼭 챙김 — 주의(호박색). 빨강은 위험, 남색은 누를 수 있는 것이라 피한다.
  essentialPill: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    backgroundColor: Role.warnSoft,
  },
  essentialPillText: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: Role.warn,
  },
  tempPill: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    backgroundColor: Colors.slate100,
  },
  tempPillText: {
    fontSize: FontSize.caption,
    color: Colors.slate500,
  },
  badge: {
    marginTop: 2,
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.amber700,
  },
  // 삭제는 체크 바로 옆이라 잘못 누르기 쉽다 — 44×44로 키우고, 눌러도 되돌릴 수 있게 했다.
  deleteButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
