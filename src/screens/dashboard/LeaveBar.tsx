import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotebookPen } from 'lucide-react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../../constants/theme';
import { useAppStore } from '../../store';
import { leaveResultMessage, pressLeave } from '../../services/departure/leave';

// [떠나기]는 나가는 순간에 누르는 버튼이라 스크롤 위치와 상관없이 항상 엄지 아래에 둔다.
// 남은 게 있으면 마지막 확인 알림을 띄워 주머니 속에서도 보이게 한다.
// 왼쪽의 [메모]는 급하게 적을 일을 어디서든 한 번에 열도록 같은 줄에 둔다.
export function LeaveBar({ onHeight, onMemo }: { onHeight: (height: number) => void; onMemo: () => void }) {
  const styles = useStyles();
  const { Role } = useTheme();
  const memoCount = useAppStore((s) => s.memos.length);
  const insets = useSafeAreaInsets();
  const checklist = useAppStore((s) => s.checklist);
  const showToast = useAppStore((s) => s.showToast);

  // 결과는 토스트로 바로 알린다. 연타해도 알림이 한 번만 뜨도록 진행 중엔 막는다.
  const [leaving, setLeaving] = useState(false);
  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      showToast(leaveResultMessage(await pressLeave()));
    } finally {
      setLeaving(false);
    }
  };

  const total = checklist.length;
  const remaining = total - checklist.filter((i) => i.checked).length;
  const sub = total === 0 ? '챙길 것 없음' : remaining === 0 ? '다 챙겼어요' : `아직 ${remaining}개 남음`;

  return (
    <View
      style={[styles.bar, { paddingBottom: insets.bottom + Space.md }]}
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
    >
      <Pressable
        style={({ pressed }) => [styles.memoButton, pressed && styles.pressed]}
        onPress={onMemo}
        accessibilityRole="button"
        accessibilityLabel={memoCount > 0 ? `메모 ${memoCount}개 — 열어서 보거나 새로 적기` : '메모 적기'}
      >
        <NotebookPen size={20} color={Role.actionText} />
        <Text style={styles.memoLabel}>{memoCount > 0 ? `메모 ${memoCount}` : '메모'}</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={handleLeave}
        disabled={leaving}
        accessibilityRole="button"
        accessibilityLabel={`떠나기 — 나가기 전에 남은 것 확인. ${sub}`}
      >
        <Text style={styles.buttonText}>떠나기</Text>
        <Text style={styles.buttonSub}>{sub}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ Role, Shadow }) => ({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: Space.md,
    paddingHorizontal: Space.xl,
    flexDirection: 'row',
    gap: Space.sm,
    backgroundColor: Role.bg,
    ...Shadow.floating,
  },
  memoButton: {
    width: 64,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: Radius.lg,
    backgroundColor: Role.actionSoft,
  },
  memoLabel: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Role.actionText,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: Space.sm,
    minHeight: 56,
    paddingVertical: Space.lg,
    borderRadius: Radius.lg,
    backgroundColor: Role.action,
  },
  pressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.onAction,
  },
  buttonSub: {
    fontSize: FontSize.label,
    color: Role.onActionSub,
  },
}));
