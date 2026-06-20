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
