import React from 'react';
import { Linking, Modal, Pressable, Text, View } from 'react-native';
import { ExternalLink, X } from 'lucide-react-native';
import { FontSize, Radius, Space, makeStyles, useTheme } from '../constants/theme';
import { useAppStore } from '../store';

// 밖에서 물건을 잃어버렸을 때 — 찾을 수 있는 공식 창구로 바로 보낸다 (docs/결합-서비스-설계.md 2장).
// 아맞다는 "안 챙기고 나옴"까지가 본업이고, 이건 그 뒤를 수습하는 연결만 한다. 조회는 각 사이트에서.
//
// 주소 확인 (2026-11-25):
// - 경찰청 유실물 통합포털 — korea.kr 정책뉴스·서울시 미디어허브가 안내하는 공식 주소. 전국 경찰서와
//   유실물 운영기관(서울교통공사 등)의 습득물이 모인다. 대중교통 기관은 7일 보관 뒤 경찰서로 넘긴다.
//   (개발 환경에서 직접 접속은 안 돼서 기기에서 열리는지 확인 필요)
// - 서울 대중교통 분실물센터 — 서울시 교통 누리집. 응답·페이지 제목 확인함.
export const LOST_ITEM_LINKS: ReadonlyArray<{ title: string; sub: string; url: string }> = [
  {
    title: '경찰청 유실물 통합포털 (LOST112)',
    sub: '전국 경찰서·지하철·철도에서 주운 물건. 일주일이 지났으면 여기',
    url: 'https://www.lost112.go.kr/',
  },
  {
    title: '서울 대중교통 분실물센터',
    sub: '서울 버스·지하철에서 잃어버렸을 때 먼저',
    url: 'https://news.seoul.go.kr/traffic/find',
  },
];

// 시트 본문 — 다른 시트(항목 옵션) 안에서도 쓴다. iOS는 모달이 닫히는 중에 다른 모달을 못 띄워서
// 시트를 갈아 끼우지 않고 같은 모달 안에서 본문만 바꾼다.
export function LostItemContent({ onClose, label }: { onClose: () => void; label?: string }) {
  const styles = useStyles();
  const { Role } = useTheme();
  const showToast = useAppStore((s) => s.showToast);

  const open = (url: string) => {
    Linking.openURL(url).catch(() => showToast('페이지를 열지 못했어요.', null, 'error'));
  };

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {label ? `'${label}'을(를) 잃어버렸나요?` : '물건을 잃어버렸나요?'}
        </Text>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기">
          <X size={20} color={Role.textMuted} />
        </Pressable>
      </View>
      <Text style={styles.lead}>
        주운 물건은 보관 기관의 사이트에 사진과 함께 올라와요. 교통카드로 탔다면 탄 차량을 알려 주면 더 빨리 찾아요.
      </Text>

      {LOST_ITEM_LINKS.map((link) => (
        <Pressable
          key={link.url}
          style={styles.option}
          onPress={() => open(link.url)}
          accessibilityRole="link"
          accessibilityLabel={`${link.title}, ${link.sub}`}
        >
          <View style={styles.optionText}>
            <Text style={styles.optionLabel}>{link.title}</Text>
            <Text style={styles.optionSub}>{link.sub}</Text>
          </View>
          <ExternalLink size={18} color={Role.actionText} />
        </Pressable>
      ))}
    </>
  );
}

export function LostItemSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onClose} accessibilityLabel="닫기" />
        <View style={styles.sheet}>
          <LostItemContent onClose={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ Role }) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Role.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Space.xl,
    paddingTop: 18,
    paddingBottom: 32,
    gap: Space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
  },
  title: {
    flex: 1,
    fontSize: FontSize.heading,
    fontWeight: '700',
    color: Role.text,
  },
  lead: {
    fontSize: FontSize.label,
    lineHeight: 19,
    color: Role.textSub,
    marginBottom: Space.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: 56,
    padding: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Role.border,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Role.textStrong,
  },
  optionSub: {
    marginTop: 2,
    fontSize: FontSize.caption,
    color: Role.textMuted,
  },
}));
