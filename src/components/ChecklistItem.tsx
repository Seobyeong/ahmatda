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
  onToggle: (id: number) => void;
  onDelete?: (id: number) => void;
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

export function ChecklistItem({ item, onToggle, onDelete, purposeColor }: ChecklistItemProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (item.checked) {
      translateX.setValue(0);
      opacity.setValue(1);
    }
  }, [item.checked, translateX, opacity]);

  const handlePress = () => {
    if (item.checked) {
      onToggle(item.id);
      return;
    }
    Animated.parallel([
      Animated.timing(translateX, { toValue: 80, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      onToggle(item.id);
    });
  };

  const Icon = ICONS[item.icon] ?? Circle;
  const iconColor = getTierColor(item.tier, purposeColor);
  const showDelete = item.temp || item.permanent || item.tier === 1 || item.tier === 2;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          opacity: Animated.multiply(opacity, item.checked ? 0.4 : 1),
          transform: [{ translateX }],
        },
      ]}
    >
      <Pressable style={styles.row} onPress={handlePress}>
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
        <Pressable style={styles.deleteButton} onPress={() => onDelete?.(item.id)} hitSlop={8}>
          <X size={16} color={Colors.slate400} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

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
