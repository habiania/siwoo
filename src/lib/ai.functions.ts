import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveModel } from "./ai-provider.server";
import { MODELS } from "./ai-models";

const PLATFORM_GUIDELINES: Record<string, string> = {
  toss: "토스쇼핑: 클릭률 중심. 짧고 임팩트 있게. 이모지 1개 허용. 가격/혜택 강조.",
  "11st": "11번가: 검색 최적화 중심. 핵심 키워드 3~5개를 자연스럽게 포함. 60자 이내.",
  gmarket: "G마켓: 구매전환 중심. 신뢰감 있는 문구, 사이즈/색상/수량 정보 명시.",
  auction: "옥션: 가격 경쟁력 중심. '특가', '최저가', '오늘만' 등 가격 어필 키워드 사용.",
};

export const generatePlatformContent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        sourceName: z.string(),
        category: z.string().optional(),
        description: z.string().optional(),
        platforms: z.array(z.enum(["toss", "11st", "gmarket", "auction"])).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const model = resolveModel(MODELS.productContent); // 상품 업로드 → GPT

    const platformRules = data.platforms.map((p) => `- ${p}: ${PLATFORM_GUIDELINES[p]}`).join("\n");

    const { output } = await generateText({
      model,
      experimental_output: Output.object({
        schema: z.object({
          listings: z.array(
            z.object({
              platform: z.enum(["toss", "11st", "gmarket", "auction"]),
              title: z.string(),
              promo: z.string(),
              tags: z.array(z.string()),
            }),
          ),
          detail_html: z.string(),
        }),
      }),
      prompt: `너는 한국 오픈마켓 위탁판매 콘텐츠 전문가다.

원본 상품명: ${data.sourceName}
카테고리: ${data.category ?? "미상"}
상품 설명: ${data.description ?? "없음"}

다음 플랫폼별 가이드라인에 맞춰 서로 다른 상품명을 생성하라:
${platformRules}

각 플랫폼별로:
- title: 플랫폼 최적화된 상품명 (60자 이내)
- promo: 프로모션 문구 1줄 (예: "1+1 특가", "무료배송", "여름 시즌 한정")
- tags: 검색 태그 5~8개

그리고 모든 플랫폼 공통 상세페이지 HTML(detail_html)을 생성하라. 구성: 상품소개 / 주요특징 / 사용방법 / 주의사항 / 배송정보 / 교환반품안내. <h2><p><ul><li> 태그만 사용. 인라인 style 금지.`,
    });

    return output;
  });

export const evaluateProduct = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        sourceName: z.string(),
        category: z.string().optional(),
        supplyPrice: z.number(),
        marginRate: z.number(),
        stockQty: z.number(),
        salesCount: z.number().optional(),
        reviewCount: z.number().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const model = resolveModel(MODELS.productEvaluation); // 데이터 분석(평가) → GPT

    const { output } = await generateText({
      model,
      experimental_output: Output.object({
        schema: z.object({
          ai_score: z.number().min(0).max(100),
          trademark_risk: z.enum(["safe", "caution", "danger"]),
          risk_reason: z.string(),
          breakdown: z.object({
            sales: z.number(),
            margin: z.number(),
            review: z.number(),
            competition: z.number(),
            seasonality: z.number(),
            stock: z.number(),
          }),
          recommendation: z.string(),
        }),
      }),
      prompt: `상품 평가 요청. 다음 데이터를 기반으로 100점 만점 AI 점수와 상표권 위험도를 평가하라.

상품명: ${data.sourceName}
카테고리: ${data.category ?? "미상"}
공급가: ${data.supplyPrice}원
마진율: ${data.marginRate}%
재고: ${data.stockQty}개
판매량: ${data.salesCount ?? 0}건
리뷰: ${data.reviewCount ?? 0}건

가중치: 판매량 35% / 마진율 25% / 리뷰수 15% / 경쟁강도 10% / 계절성 10% / 재고안정성 5%

breakdown의 각 항목은 0~100점.
trademark_risk는 상품명에 유명 브랜드나 위험 단어가 있는지 판단:
- safe: 위험 없음
- caution: 일반명사+브랜드 연상어
- danger: 명백한 상표권 침해 가능

recommendation: 한 문장으로 등록 추천 사유 또는 주의사항.`,
    });

    return output;
  });
