import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { FontSize, Radius, makeStyles, useTheme } from '../constants/theme';
import { ACCENTS } from '../constants/colors';
import { useAppStore } from '../store';

// 설정 > 앱 색상. 버튼·링크처럼 누를 수 있는 것의 색을 고른다.
// 동그라미는 지금 화면(밝은/어두운)에서 실제로 보일 버튼 색으로 칠한다.
export function AccentColorSettings({ titleStyle, descriptionStyle }: {
  titleStyle: object;
  descriptionStyle: object;
}) {
  const styles = useStyles();
  const { scheme, accent, Colors } = useTheme();
  const setAccentColor = useAppStore((s) => s.setAccentColor);

  return (
    <View>
      <Text style={titleStyle}>앱 색상</Text>
      <Text style={descriptionStyle}>버튼과 누를 수 있는 글자의 색이에요.</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {ACCENTS.map((a) => {
          const selected = a.id === accent;
          return (
            <Pressable
              key={a.id}
              style={styles.option}
              onPress={() => setAccentColor(a.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={a.label}
            >
              <View style={[styles.ring, selected && { borderColor: a[scheme].indigo600 }]}>
                <View style={[styles.swatch, { backgroundColor: a[scheme].indigo600 }]}>
                  {selected ? <Check size={20} color={Colors.onColor} strokeWidth={3} /> : null}
                </View>
              </View>
              <Text style={[styles.label, selected && styles.labelSelected]}>{a.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ Colors }) => ({
  row: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  option: {
    width: 56,
    alignItems: 'center',
    paddingVertical: 4,
  },
  // 고른 색은 바깥 고리로도 표시한다 — 체크 표시만으로는 작은 화면에서 놓치기 쉽다.
  ring: {
    padding: 3,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 4,
    fontSize: FontSize.caption,
    color: Colors.slate600,
  },
  labelSelected: {
    fontWeight: '700',
    color: Colors.slate800,
  },
}));
