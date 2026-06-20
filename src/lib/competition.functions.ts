import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ScoreBreakdown } from "./scoring";
import { totalFromBreakdown } from "./scoring";

function admin() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .trim();
}

type NaverShopItem = { title: string; lprice: string; hprice: string; mallName: string };
type CompetitionStat = {
  keyword: string;
  platform: "naver";
  product_count: number;
  total_reviews: number;
  avg_price: number;
  min_price: number;
  max_price: number;
  top_titles: string[];
};

/** 네이버 쇼핑 검색 API로 경쟁 현황 수집 (판매가 분포 + 상위 제목) */
async function naverShopSearch(
  keyword: string,
  clientId: string,
  clientSecret: string,
): Promise<CompetitionStat | null> {
  const url =
    `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}` +
    `&display=100&sort=sim`;
  let json: { total?: number; items?: NaverShopItem[] };
  try {
    const res = await fetch(url, {
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    json = (await res.json()) as { total?: number; items?: NaverShopItem[] };
  } catch {
    return null;
  }

  const items = json.items ?? [];
  const prices = items.map((i) => Number(i.lprice)).filter((n) => n > 0);
  if (prices.length === 0) {
    return {
      keyword,
      platform: "naver",
      product_count: json.total ?? 0,
      total_reviews: 0,
      avg_price: 0,
      min_price: 0,
      max_price: 0,
      top_titles: items.slice(0, 100).map((i) => stripTags(i.title)),
    };
  }
  const sum = prices.reduce((a, b) => a + b, 0);
  return {
    keyword,
    platform: "naver",
    product_count: json.total ?? items.length,
    total_reviews: 0, // 네이버 쇼핑 검색 API는 리뷰수를 제공하지 않음 (실데이터만 저장)
    avg_price: Math.round(sum / prices.length),
    min_price: Math.min(...prices),
    max_price: Math.max(...prices),
    top_titles: items.slice(0, 100).map((i) => stripTags(i.title)),
  };
}

// product_count → 경쟁강도 0~100 (많을수록 경쟁 심함)
function competitionLevel(productCount: number): number {
  if (productCount <= 0) return 0;
  return Math.min(100, Math.round((Math.log10(1 + productCount) / Math.log10(1 + 100000)) * 100));
}

/** 단일 키워드 경쟁 분석 → market_analysis 저장. productId 주면 해당 상품 경쟁강도 재반영. */
export const analyzeCompetition = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ keyword: z.string().min(1), productId: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: s } = await sb
      .from("settings")
      .select("naver_client_id, naver_client_secret")
      .eq("id", 1)
      .maybeSingle();
    if (!s?.naver_client_id || !s?.naver_client_secret) {
      throw new Error("네이버 API 키가 설정되지 않았습니다 (설정 → 네이버 Client ID/Secret)");
    }

    const stat = await naverShopSearch(data.keyword, s.naver_client_id, s.naver_client_secret);
    if (!stat) throw new Error("네이버 쇼핑 검색 실패");

    await sb.from("market_analysis").insert({
      product_id: data.productId ?? null,
      keyword: stat.keyword,
      platform: stat.platform,
      product_count: stat.product_count,
      total_reviews: stat.total_reviews,
      avg_price: stat.avg_price,
      min_price: stat.min_price,
      max_price: stat.max_price,
      top_titles: stat.top_titles as never,
      raw: { source: "naver_shop" } as never,
    });

    // 상품 연결 시 경쟁강도를 점수에 재반영
    if (data.productId) {
      const { data: p } = await sb
        .from("products")
        .select("score_breakdown")
        .eq("id", data.productId)
        .maybeSingle();
      const bd = (p?.score_breakdown as ScoreBreakdown | null) ?? null;
      if (bd) {
        const updated: ScoreBreakdown = {
          ...bd,
          competition: 100 - competitionLevel(stat.product_count),
        };
        await sb
          .from("products")
          .update({ score_breakdown: updated as never, ai_score: totalFromBreakdown(updated) })
          .eq("id", data.productId);
      }
    }

    return { ...stat, competitionLevel: competitionLevel(stat.product_count) };
  });

/** 검수 대기 상품들의 경쟁 분석 일괄 실행 */
export const analyzePendingCompetition = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).default(20) }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const sb = admin();
    const { data: s } = await sb
      .from("settings")
      .select("naver_client_id, naver_client_secret")
      .eq("id", 1)
      .maybeSingle();
    if (!s?.naver_client_id || !s?.naver_client_secret) {
      throw new Error("네이버 API 키가 설정되지 않았습니다 (설정 → 네이버 Client ID/Secret)");
    }

    const { data: products } = await sb
      .from("products")
      .select("id, source_name, category, score_breakdown")
      .eq("status", "pending")
      .order("ai_score", { ascending: false })
      .limit(data.limit);

    let analyzed = 0;
    for (const p of products ?? []) {
      const keyword = p.category || p.source_name.split(" ").slice(0, 2).join(" ");
      const stat = await naverShopSearch(keyword, s.naver_client_id, s.naver_client_secret);
      if (!stat) continue;
      await sb.from("market_analysis").insert({
        product_id: p.id,
        keyword: stat.keyword,
        platform: stat.platform,
        product_count: stat.product_count,
        total_reviews: stat.total_reviews,
        avg_price: stat.avg_price,
        min_price: stat.min_price,
        max_price: stat.max_price,
        top_titles: stat.top_titles as never,
        raw: { source: "naver_shop" } as never,
      });
      const bd = (p.score_breakdown as ScoreBreakdown | null) ?? null;
      if (bd) {
        const updated: ScoreBreakdown = {
          ...bd,
          competition: 100 - competitionLevel(stat.product_count),
        };
        await sb
          .from("products")
          .update({ score_breakdown: updated as never, ai_score: totalFromBreakdown(updated) })
          .eq("id", p.id);
      }
      analyzed++;
    }

    await sb.from("activity_log").insert({
      action: "competition_analyzed",
      target_type: "product",
      message: `[경쟁분석] ${analyzed}개 상품 네이버쇼핑 분석 완료`,
      metadata: { analyzed } as never,
    });

    return { analyzed };
  });
