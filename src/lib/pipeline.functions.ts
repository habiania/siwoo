import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { collectTrends } from "./trends.functions";
import { sourceProducts } from "./sourcing.functions";
import { scanKcPending } from "./kc.functions";
import { scanPendingProducts } from "./kipris.functions";
import { analyzePendingCompetition } from "./competition.functions";
import { repriceAll } from "./pricing.functions";

// 반환값은 서버펀션 직렬화 검증을 통과해야 하므로 result 는 문자열(detail)로 요약한다.
type StepResult = { step: string; ok: boolean; detail: string };

async function step(name: string, fn: () => Promise<unknown>): Promise<StepResult> {
  try {
    const result = await fn();
    return { step: name, ok: true, detail: JSON.stringify(result) };
  } catch (e) {
    return { step: name, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 일일 자동화 파이프라인 (사용자 개입 0).
 * 트렌드 수집 → 상품 소싱(80점↑) → KC 검사 → 상표 검사 → 경쟁 분석 → 재가격.
 * 각 단계는 독립적으로 try/catch 되어 한 단계 실패가 전체를 막지 않는다.
 */
export const runDailyPipeline = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({}).parse(i ?? {}))
  .handler(async () => {
    const steps: StepResult[] = [];
    steps.push(await step("collectTrends", () => collectTrends({ data: { limit: 10 } })));
    steps.push(
      await step("sourceProducts", () =>
        sourceProducts({ data: { keywordCount: 5, perKeyword: 5 } }),
      ),
    );
    steps.push(await step("kcScan", () => scanKcPending({ data: { limit: 100 } })));
    steps.push(await step("trademarkScan", () => scanPendingProducts({ data: { limit: 100 } })));
    steps.push(await step("competition", () => analyzePendingCompetition({ data: { limit: 20 } })));
    steps.push(await step("reprice", () => repriceAll({ data: { limit: 200 } })));

    return { ranAt: new Date().toISOString(), ok: steps.every((s) => s.ok), steps };
  });

/**
 * "오늘의 검수" 버튼용 경량 파이프라인 (사용자 클릭 1회로 끝):
 *   트렌드(데이터) 분석 → 도매꾹 소싱(상세페이지 AI 품질평가) → 상표 안전 상품명·프로모션 생성
 *   → 정상가/판매가/마진은 소싱 단계에서 도매 공급가 기준으로 계산됨.
 * Vercel 60s 안에 끝나도록 소싱은 1회 소수(MAX_EVAL)만 처리한다 — 더 필요하면 다시 누르면 됨.
 */
export const runDailyReview = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({}).parse(i ?? {}))
  .handler(async () => {
    const steps: StepResult[] = [];
    steps.push(await step("collectTrends", () => collectTrends({ data: { limit: 8 } })));
    steps.push(
      await step("sourceProducts", () =>
        sourceProducts({ data: { keywordCount: 3, perKeyword: 3 } }),
      ),
    );
    const sourced = steps.find((s) => s.step === "sourceProducts");
    return { ranAt: new Date().toISOString(), ok: steps.every((s) => s.ok), steps, sourced };
  });
