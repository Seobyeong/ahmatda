// React Native hex 색상 토큰
// Tailwind 클래스 → hex 변환

export const Colors = {
  // Primary
  indigo600: '#4f46e5',
  violet600: '#7c3aed',

  // Purpose colors
  indigo50:  '#eef2ff',
  indigo100: '#e0e7ff',
  emerald600:'#059669',
  emerald50: '#ecfdf5',
  violet50:  '#f5f3ff',
  rose500:   '#f43f5e',
  rose50:    '#fff1f2',
  amber500:  '#f59e0b',
  amber50:   '#fffbeb',

  // Weather
  sky500:    '#0ea5e9',
  sky400:    '#38bdf8',
  sky600:    '#0284c7',
  sky50:     '#f0f9ff',
  orange400: '#fb923c',
  orange600: '#ea580c',
  orange50:  '#fff7ed',
  blue500:   '#3b82f6',
  blue400:   '#60a5fa',
  blue600:   '#2563eb',
  blue50:    '#eff6ff',
  indigo400: '#818cf8',

  // Neutral
  slate800:  '#1e293b',
  slate700:  '#334155',
  slate600:  '#475569',
  slate500:  '#64748b',
  slate400:  '#94a3b8',
  slate300:  '#cbd5e1',
  slate200:  '#e2e8f0',
  slate100:  '#f1f5f9',
  slate50:   '#f8fafc',
  white:     '#ffffff',

  // Status
  emerald500: '#10b981',
  emerald100: '#d1fae5',
  red500:     '#ef4444',

  // Background
  bgDefault:  '#f8fafc',
} as const;

// 목적별 색상 맵
export const PurposeColors: Record<string, {
  chip: string;
  section: string;
  badge: string;
  badgeText: string;
}> = {
  indigo:  { chip: Colors.indigo600, section: Colors.indigo600,  badge: Colors.indigo50,  badgeText: Colors.indigo600 },
  emerald: { chip: Colors.emerald600,section: Colors.emerald600, badge: Colors.emerald50, badgeText: Colors.emerald600 },
  violet:  { chip: Colors.violet600, section: Colors.violet600,  badge: Colors.violet50,  badgeText: Colors.violet600 },
  rose:    { chip: Colors.rose500,   section: Colors.rose500,    badge: Colors.rose50,    badgeText: Colors.rose500 },
  amber:   { chip: Colors.amber500,  section: Colors.amber500,   badge: Colors.amber50,   badgeText: Colors.amber500 },
};
