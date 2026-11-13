import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { FontSize, Radius } from '../constants/theme';
import { PURPOSES } from '../constants/purposes';
import { SENSITIVITY_LABELS } from '../constants/feedback';
import { useAppStore } from '../store';
import { buildPersonalizeTemplate } from '../services/personalize/template';
import {
  buildPersonalizePlan,
  isEmptyPlan,
  parsePersonalization,
  type PersonalizePlan,
} from '../services/personalize/importPlan';

interface PersonalizeModalProps {
  visible: boolean;
  onClose: () => void;
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// 템플릿 개인화 (docs/AI-연결-설계.md 11장)
// 사용자가 구독 중인 AI 앱에서 대화하고, 그 답변을 붙여넣어 반영한다. 앱은 아무것도
// 전송하지 않는다 — 템플릿은 OS 공유 시트로 사용자가 고른 앱에 넘긴다.
export function PersonalizeModal({ visible, onClose }: PersonalizeModalProps) {
  const userSettings = useAppStore((s) => s.userSettings);
  const permanentRoutines = useAppStore((s) => s.permanentRoutines);
  const applyPersonalization = useAppStore((s) => s.applyPersonalization);
  const showToast = useAppStore((s) => s.showToast);

  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PersonalizePlan | null>(null);

  const reset = () => {
    setPasted('');
    setError(null);
    setPlan(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleShareTemplate = () => {
    Share.share({ message: buildPersonalizeTemplate() }).catch(() => {});
  };

  const handlePreview = () => {
    const parsed = parsePersonalization(pasted);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const next = buildPersonalizePlan(parsed.data, { userSettings, permanentRoutines });
    if (isEmptyPlan(next)) {
      setError(
        next.skipped.length > 0
          ? `반영할 수 있는 내용이 없어요.\n${next.skipped.join('\n')}`
          : '지금 설정과 달라지는 내용이 없어요.'
      );
      return;
    }
    setError(null);
    setPlan(next);
  };

  const handleApply = () => {
    if (!plan) return;
    applyPersonalization(plan);
    showToast('개인화 내용을 반영했어요.');
    handleClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>AI로 개인화하기</Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <X size={20} color={Colors.slate500} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {plan ? (
              <>
                <Text style={styles.stepTitle}>이렇게 바뀌어요</Text>
                {plan.departureTime ? (
                  <Text style={styles.planLine}>
                    외출 시간 {plan.departureTime.from} → {plan.departureTime.to}
                  </Text>
                ) : null}
                {plan.sensitivity ? (
                  <Text style={styles.planLine}>
                    체온 민감도 {SENSITIVITY_LABELS[plan.sensitivity.from]} → {SENSITIVITY_LABELS[plan.sensitivity.to]}
                  </Text>
                ) : null}
                {plan.routines.map((r) => (
                  <Text key={`r-${r.label}`} style={styles.planLine}>
                    루틴 추가 · {r.label}
                    {r.days ? ` (${r.days.map((d) => DAY_LABELS[d]).join('·')})` : ' (매일)'}
                  </Text>
                ))}
                {plan.keywords.map((k) => (
                  <Text key={`k-${k.purposeId}-${k.keyword}`} style={styles.planLine}>
                    키워드 추가 · '{k.keyword}' → {PURPOSES[k.purposeId].shortLabel}
                  </Text>
                ))}
                {plan.disableItems.map((d) => (
                  <Text key={`d-${d.purposeId}-${d.label}`} style={styles.planLine}>
                    준비물 끄기 · {PURPOSES[d.purposeId].shortLabel} '{d.label}'
                  </Text>
                ))}
                {plan.skipped.length > 0 ? (
                  <>
                    <Text style={styles.skippedTitle}>반영하지 않는 것</Text>
                    {plan.skipped.map((reason, i) => (
                      <Text key={`s-${i}`} style={styles.skippedLine}>
                        {reason}
                      </Text>
                    ))}
                  </>
                ) : null}
                <Text style={styles.note}>기존 루틴과 키워드는 지우지 않고, 추가만 해요.</Text>

                <View style={styles.buttonRow}>
                  <Pressable style={[styles.secondaryButton, styles.rowButton]} onPress={() => setPlan(null)}>
                    <Text style={styles.secondaryText}>다시 붙여넣기</Text>
                  </Pressable>
                  <Pressable style={[styles.primaryButton, styles.rowButton]} onPress={handleApply}>
                    <Text style={styles.primaryText}>적용</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.stepTitle}>1. 템플릿을 AI 앱으로 보내기</Text>
                <Text style={styles.description}>
                  쓰고 계신 AI 앱(ChatGPT, Claude, Gemini 등)으로 템플릿을 보내고, AI의 질문에 답해 주세요.
                  아맞다는 아무것도 전송하지 않고, 추가 비용도 없어요.
                </Text>
                <Pressable style={styles.primaryButton} onPress={handleShareTemplate}>
                  <Text style={styles.primaryText}>템플릿 보내기</Text>
                </Pressable>

                <Text style={[styles.stepTitle, styles.stepSpacing]}>2. AI 답변 붙여넣기</Text>
                <Text style={styles.description}>대화가 끝나면 AI가 준 코드블록을 복사해서 붙여넣어 주세요.</Text>
                <TextInput
                  style={styles.input}
                  value={pasted}
                  onChangeText={(text) => {
                    setPasted(text);
                    setError(null);
                  }}
                  placeholder='{ "ahmatda": 1, ... }'
                  placeholderTextColor={Colors.slate400}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlignVertical="top"
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable
                  style={[styles.primaryButton, !pasted.trim() && styles.buttonDisabled]}
                  onPress={handlePreview}
                  disabled={!pasted.trim()}
                >
                  <Text style={styles.primaryText}>미리보기</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  title: {
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Colors.slate800,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  stepTitle: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.slate700,
  },
  stepSpacing: {
    marginTop: 22,
  },
  description: {
    marginBottom: 10,
    fontSize: FontSize.caption,
    lineHeight: 18,
    color: Colors.slate500,
  },
  input: {
    minHeight: 120,
    maxHeight: 220,
    padding: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.slate50,
    fontSize: FontSize.caption,
    color: Colors.slate800,
    marginBottom: 10,
  },
  error: {
    marginBottom: 10,
    fontSize: FontSize.caption,
    lineHeight: 18,
    color: Colors.red500,
  },
  planLine: {
    paddingVertical: 6,
    fontSize: FontSize.label,
    color: Colors.slate700,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate100,
  },
  skippedTitle: {
    marginTop: 14,
    marginBottom: 4,
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: Colors.slate400,
  },
  skippedLine: {
    paddingVertical: 2,
    fontSize: FontSize.caption,
    color: Colors.slate400,
  },
  note: {
    marginTop: 14,
    fontSize: FontSize.caption,
    color: Colors.slate400,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  rowButton: {
    flex: 1,
  },
  primaryButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.indigo600,
  },
  primaryText: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.white,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.slate100,
  },
  secondaryText: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.slate600,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
