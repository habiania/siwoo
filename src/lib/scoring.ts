// 8요소 상품 스코어링 엔진 (순수 결정론, 0~100점).
// 위탁판매 셀러의 "이 상품 등록할까?" 의사결정을 수치화한다.

export type ScoreInput = {
  marginRate: number; // 순이익률 % (예: 22)
  salesCount: number; // 월 판매량
  reviewCount: number; // 누적 리뷰수
  reviewVelocity?: number; // 최근 리뷰 증가속도 0~100 (없으면 중립)
  competitionLevel?: number; // 경쟁강도 0~100 (높을수록 경쟁 심함, 없으면 중립)
  seasonality?: number; // 계절 적합도 0~100 (트렌드 점수 등, 없으면 중립)
  shippingScore?: number; // 배송 경쟁력 0~100 (없으면 중립)
  supplierTrust?: number; // 공급사 신뢰도 0~100 (없으면 중립)
};

export type ScoreBreakdown = {
  margin: number;
  sales: number;
  review: number;
  reviewVelocity: number;
  competition: number;
  seasonality: number;
  shipping: number;
  supplier: number;
};

// 가중치 (합 100)
const WEIGHTS: ScoreBreakdown = {
  margin: 25,
  sales: 20,
  review: 12,
  reviewVelocity: 8,
  competition: 10,
  seasonality: 8,
  shipping: 8,
  supplier: 9,
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// 선형 정규화: lo 이하 0점, hi 이상 100점
function linear(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp(((value - lo) / (hi - lo)) * 100);
}

// 로그 정규화: 0 → 0점, hi → 100점 (판매량/리뷰수처럼 꼬리가 긴 분포)
function logScore(value: number, hi: number): number {
  if (value <= 0) return 0;
  return clamp((Math.log10(1 + value) / Math.log10(1 + hi)) * 100);
}

/** 8요소 점수 계산 → { score, breakdown } */
export function scoreProduct(input: ScoreInput): { score: number; breakdown: ScoreBreakdown } {
  const breakdown: ScoreBreakdown = {
    margin: Math.round(linear(input.marginRate, 10, 40)), // 10% 이하 0, 40% 이상 100
    sales: Math.round(logScore(input.salesCount, 1000)),
    review: Math.round(logScore(input.reviewCount, 500)),
    reviewVelocity: Math.round(clamp(input.reviewVelocity ?? 50)),
    competition: Math.round(clamp(100 - (input.competitionLevel ?? 50))), // 경쟁 낮을수록 고득점
    seasonality: Math.round(clamp(input.seasonality ?? 50)),
    shipping: Math.round(clamp(input.shippingScore ?? 50)),
    supplier: Math.round(clamp(input.supplierTrust ?? 50)),
  };

  let total = 0;
  (Object.keys(WEIGHTS) as (keyof ScoreBreakdown)[]).forEach((k) => {
    total += (breakdown[k] * WEIGHTS[k]) / 100;
  });

  return { score: Math.round(clamp(total)), breakdown };
}

/** 저장된 breakdown 으로 총점 재계산 (경쟁강도 등 단일 요소만 갱신할 때 사용) */
export function totalFromBreakdown(breakdown: ScoreBreakdown): number {
  let total = 0;
  (Object.keys(WEIGHTS) as (keyof ScoreBreakdown)[]).forEach((k) => {
    total += (clamp(breakdown[k]) * WEIGHTS[k]) / 100;
  });
  return Math.round(clamp(total));
}

// 신규 도매 상품은 리뷰·판매이력이 0이라 구조적으로 ~45~55점이 한계다.
// 너무 높으면(80) 전부 탈락하므로, AI 는 느슨하게 후보를 거르고 최종 선별은
// 사람이 "검수" 단계에서 한다. (45점 이상 = 검토할 가치가 있는 후보)
export const REGISTER_THRESHOLD = 45;
