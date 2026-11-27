import type { ChecklistItem as ChecklistItemType } from '../types';

const TIERS = [0, 1, 2, 3] as const;

// 방금 챙긴 항목은 잠깐 제자리에 둔다 — 바로 아래로 내려가면 이어서 누르던 손가락이 다른 줄을 누른다.
export const SETTLE_MS = 1200;

// 안 챙긴 것은 분류별로 나누고(꼭 챙김을 맨 위로), 챙긴 것은 맨 아래 "챙긴 것 N개"로 모은다.
// 방금 챙긴 것(settling)은 SETTLE_MS 동안 원래 분류에 남는다. 정렬은 안정적이라 나머지는 원래 순서 유지.
export function splitChecklist(checklist: ChecklistItemType[], settling: ReadonlySet<string>) {
  const stays = (item: ChecklistItemType) => !item.checked || settling.has(item.id);
  const sections = TIERS.map((tier) => ({
    tier,
    items: checklist
      .filter((item) => item.tier === tier && stays(item))
      // 챙김 여부로는 정렬하지 않는다 — 방금 챙긴 것이 분류 맨 아래로 튀면 다음 탭이 다른 줄에 간다.
      .sort((a, b) => Number(Boolean(b.essential)) - Number(Boolean(a.essential))),
  })).filter((section) => section.items.length > 0);
  const packed = checklist.filter((item) => !stays(item));
  return { sections, packed };
}

