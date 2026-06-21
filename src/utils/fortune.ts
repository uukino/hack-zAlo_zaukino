// src/utils/fortune.ts
// 雲量(%)からおみくじ形式の運勢ランクを判定する

export type FortuneLevel = '大吉' | '吉' | '中吉' | '小吉' | '凶';

export function getFortuneLevel(cloudCoverPercent: number): FortuneLevel {
  if (cloudCoverPercent < 10) return '大吉';
  if (cloudCoverPercent < 30) return '吉';
  if (cloudCoverPercent < 60) return '中吉';
  if (cloudCoverPercent < 85) return '小吉';
  return '凶';
}
