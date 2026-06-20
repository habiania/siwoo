import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateText, Output } from "ai";
import { resolveModel } from "./ai-provider.server";
import { MODELS } from "./ai-models";

function admin() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const STOP = new Set([
  "무료배송",
  "당일발송",
  "정품",
  "특가",
  "세트",
  "박스",
  "사이즈",
  "컬러",
  "new",
  "best",
  "행사",
  "무배",
  "the",
  "and",
  "for",
  "with",
  "개",
  "입",
  "팩",
  "호",
  "cm",
  "ml",
  "g",
  "kg",
]);

/** 경쟁 제목 100개에서 빈출 키워드 추출 (SEO 근거용) */
function topKeywords(titles: string[], n = 15): { word: string; count: number }[] {
  const freq = new Map<string, number>();
  for (const t of titles) {
    const tokens = t
      .replace(/[^가-힣A-Za-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP.has(w.toLowerCase()));
    for (const w of tokens) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** 경쟁 상위 제목 분석 → SEO 최적 상품명 생성 + 근거 저장 */
export const generateProductName = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ productId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: p, error } = await sb
      .from("products")
      .select("id, source_name, category")
      .eq("id", data.productId)
      .maybeSingle();
    if (error) throw error;
    if (!p) throw new Error("상품을 찾을 수 없습니다");

    // 경쟁 제목: 최신 market_analysis 우선, 없으면 카테고리 키워드 기준
    const { data: ma } = await sb
      .from("market_analysis")
      .select("top_titles, keyword")
      .eq("product_id", p.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const titles = ((ma?.top_titles as string[] | null) ?? []).slice(0, 100);
    const keywords = topKeywords(titles);

    const model = resolveModel(MODELS.productContent);
    const { output } = await generateText({
      model,
      experimental_output: Output.object({
        schema: z.object({
          name: z.string(),
          used_keywords: z.array(z.string()),
          seo_score: z.number().min(0).max(100),
          reason: z.string(),
        }),
      }),
      prompt: `너는 한국 오픈마켓 SEO 상품명 전문가다.
원본 상품명: ${p.source_name}
카테고리: ${p.category ?? "미상"}
경쟁 상위 빈출 키워드(빈도순): ${keywords.map((k) => `${k.word}(${k.count})`).join(", ") || "데이터 없음"}

규칙:
- 검색 노출 최적화. 핵심 키워드를 앞쪽에 자연스럽게 배치
- 50자 이내, 특수문자/브랜드명 금지
- 속성(성별/사이즈/소재/계절/기능) 조합
예시 형태: "빅사이즈 와플 반팔티 남성 여름 오버핏 냉감 반팔 티셔츠"

출력: name(최적 상품명), used_keywords(사용한 키워드), seo_score(0~100), reason(근거 한 문장).`,
    });

    const out = output as {
      name: string;
      used_keywords: string[];
      seo_score: number;
      reason: string;
    };
    await sb
      .from("products")
      .update({
        name_rationale: {
          name: out.name,
          used_keywords: out.used_keywords,
          seo_score: out.seo_score,
          reason: out.reason,
          source_keywords: keywords,
        } as never,
      })
      .eq("id", p.id);

    return out;
  });
