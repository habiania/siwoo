// AI 가격 결정 엔진 (순수 계산, 외부 의존 없음).
// 도매가/배송비를 받아 플랫폼 수수료·반품·교환·광고·목표 순이익을 충족하는
// 판매가와 정상가(할인 표시용)를 계산한다.

export type Platform = "toss" | "11st" | "gmarket" | "auction";

// 플랫폼별 판매 수수료율 (정산 기준, 부가세 포함 근사치). 운영 중 실제 계약율로 조정.
export const PLATFORM_FEES: Record<Platform, number> = {
  "11st": 0.13,
  gmarket: 0.12,
  auction: 0.12,
  toss: 0.05,
};

// 공통 비용 정책
export const PRICING_POLICY = {
  returnRate: 0.05, // 반품률 5%
  exchangeRate: 0.03, // 교환률 3%
  adRate: 0.1, // 광고비 10%
  displayDiscount: 0.2, // 정상가 대비 노출 할인 20% (정상가 = 판매가 / 0.8)
  defaultTargetNetMargin: 0.2, // 목표 순이익률 20%
};

export type PlatformPrice = {
  platform: Platform;
  feeRate: number;
  salePrice: number;
  normalPrice: number;
  netProfit: number;
  netMarginRate: number; // 실제 달성 순이익률
  feasible: boolean; // 목표 순이익률 달성 가능 여부
};

function roundUp100(n: number): number {
  return Math.ceil(n / 100) * 100;
}

/** 단일 플랫폼 가격 계산 */
export function calcPlatformPrice(
  platform: Platform,
  supplyPrice: number,
  shipping: number,
  targetNetMargin: number,
): PlatformPrice {
  const fee = PLATFORM_FEES[platform];
  const fixedCost = Math.max(0, supplyPrice) + Math.max(0, shipping);
  // 판매가 대비 변동비율 (수수료 + 광고 + 반품 + 교환)
  const variableRate =
    fee + PRICING_POLICY.adRate + PRICING_POLICY.returnRate + PRICING_POLICY.exchangeRate;
  // 순이익 = P*(1 - variableRate) - fixedCost ≥ targetNetMargin * P
  // → P ≥ fixedCost / (1 - variableRate - targetNetMargin)
  const denom = 1 - variableRate - targetNetMargin;

  let salePrice: number;
  let feasible = true;
  if (denom <= 0) {
    // 목표 순이익률 달성 불가 → 변동비를 제외하고 손해만 면하는 최저가로 폴백
    feasible = false;
    const breakeven = 1 - variableRate;
    salePrice = breakeven > 0 ? roundUp100(fixedCost / breakeven) : roundUp100(fixedCost * 2);
  } else {
    salePrice = roundUp100(fixedCost / denom);
  }

  const netProfit = Math.round(salePrice * (1 - variableRate) - fixedCost);
  const netMarginRate = salePrice > 0 ? netProfit / salePrice : 0;
  const normalPrice = roundUp100(salePrice / (1 - PRICING_POLICY.displayDiscount));

  return {
    platform,
    feeRate: fee,
    salePrice,
    normalPrice,
    netProfit,
    netMarginRate: Math.round(netMarginRate * 1000) / 1000,
    feasible,
  };
}

export type PricingResult = {
  recommendedSalePrice: number; // 모든 대상 플랫폼에서 목표 충족하는 단일 권장가
  normalPrice: number;
  targetNetMargin: number;
  perPlatform: PlatformPrice[];
};

/**
 * 여러 플랫폼 동시 판매를 가정한 단일 권장가 산출.
 * 가장 수수료가 높은(=가장 비싼 최저가가 나오는) 플랫폼 기준으로 잡아
 * 모든 플랫폼에서 목표 순이익률을 보장한다.
 */
export function calcPricing(
  supplyPrice: number,
  shipping: number,
  platforms: Platform[],
  targetNetMargin: number = PRICING_POLICY.defaultTargetNetMargin,
): PricingResult {
  const list = platforms.length > 0 ? platforms : (Object.keys(PLATFORM_FEES) as Platform[]);
  const perPlatform = list.map((p) => calcPlatformPrice(p, supplyPrice, shipping, targetNetMargin));
  const recommendedSalePrice = Math.max(...perPlatform.map((p) => p.salePrice));
  const normalPrice = roundUp100(recommendedSalePrice / (1 - PRICING_POLICY.displayDiscount));
  return { recommendedSalePrice, normalPrice, targetNetMargin, perPlatform };
}
