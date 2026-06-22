import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { evaluateProduct } from "./ai.functions";
import { calcPricing, type Platform } from "./pricing";
import { scoreProduct, REGISTER_THRESHOLD } from "./scoring";

type DomeItem = {
  source_id: string;
  title: string;
  price: number;
  stock: number;
  shipping: number;
  thumbnail: string | null;
  category: string | null;
};

function admin() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function pick(block: string, tag: string): string | null {
  const m = block.match(
    new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i"),
  );
  return m ? m[1].trim() : null;
}

/** 도매매(도매꾹) 오픈API getItemList 호출.
 *  실제 파라미터(ver/market/so 등)는 발급받은 API 플랜에 맞게 조정 필요.
 *  응답 XML을 <item> 단위로 파싱한다. */
async function domeSearch(keyword: string, apiKey: string, size: number): Promise<DomeItem[]> {
  const url =
    `https://domeggook.com/ssl/api/?ver=4.1&mode=getItemList&aid=${encodeURIComponent(apiKey)}` +
    `&market=dome&om=xml&kw=${encodeURIComponent(keyword)}&sz=${size}&so=rd`;
  let xml: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  const items: DomeItem[] = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  for (const b of blocks) {
    const no = pick(b, "no") ?? pick(b, "id");
    const title = pick(b, "title");
    if (!no || !title) continue;
    const price = Number((pick(b, "price") ?? "0").replace(/[^\d]/g, "")) || 0;
    // 도매꾹 응답: 최소구매수량 <unitQty>, 배송비 <deli><fee>
    const stock = Number((pick(b, "unitQty") ?? pick(b, "qty") ?? "0").replace(/[^\d]/g, "")) || 0;
    const shipping = Number((pick(b, "fee") ?? "0").replace(/[^\d]/g, "")) || 0;
    items.push({
      source_id: no,
      title,
      price,
      stock,
      shipping,
      thumbnail: pick(b, "thumb") ?? pick(b, "image"),
      category: pick(b, "ctgr") ?? pick(b, "category"),
    });
  }
  return items;
}

/** 상위 트렌드 키워드로 도매매에서 후보 상품을 소싱 → products(pending) 적재 + AI 평가 */
export const sourceProducts = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z
      .object({
        keywordCount: z.number().int().min(1).max(8).default(3),
        perKeyword: z.number().int().min(1).max(20).default(3),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const sb = admin();

    const { data: s } = await sb
      .from("settings")
      .select("domemae_api_key, target_margin_rate")
      .eq("id", 1)
      .maybeSingle();
    const apiKey = s?.domemae_api_key ?? null;
    if (!apiKey) {
      throw new Error("도매매 API 키가 설정되지 않았습니다 (설정 → 도매매 API 키)");
    }
    const marginPct = Number(s?.target_margin_rate ?? 20);
    const targetNetMargin = marginPct > 1 ? marginPct / 100 : marginPct;

    // 오늘 상위 트렌드 키워드 (계절성 점수로 trend_score 활용)
    const { data: trends } = await sb
      .from("trend_keywords")
      .select("keyword, trend_score")
      .order("collected_at", { ascending: false })
      .order("rank", { ascending: true })
      .limit(data.keywordCount);
    const keywords = (trends ?? []).map((t) => ({ kw: t.keyword, season: t.trend_score ?? 50 }));
    if (keywords.length === 0) {
      throw new Error("수집된 트렌드 키워드가 없습니다. 먼저 트렌드를 수집하세요.");
    }

    // 중복 방지: 기존 source_id 집합
    const { data: existing } = await sb
      .from("products")
      .select("source_id")
      .not("source_id", "is", null);
    const seen = new Set((existing ?? []).map((e) => e.source_id));

    // 도매매(도매꾹) 공급사 신뢰도 기본값 (실측 데이터 연동 전까지 보수적 기준)
    const SUPPLIER = "domeme";
    const SUPPLIER_TRUST = 65;

    const counts = { found: 0, inserted: 0, evaluated: 0, lowScore: 0, skipped: 0 };
    const insertedIds: {
      id: string;
      name: string;
      category: string | null;
      price: number;
      stock: number;
    }[] = [];

    for (const { kw, season } of keywords) {
      const items = await domeSearch(kw, apiKey, data.perKeyword);
      counts.found += items.length;
      for (const it of items) {
        if (seen.has(it.source_id)) {
          counts.skipped++;
          continue;
        }
        seen.add(it.source_id);

        const shipping = it.shipping;
        // 1) 가격 결정 엔진: 모든 플랫폼에서 목표 순이익률 충족하는 권장가
        const pricing = calcPricing(it.price, shipping, [] as Platform[], targetNetMargin);
        const top = pricing.perPlatform.reduce((a, b) => (b.salePrice >= a.salePrice ? b : a));

        // 2) 스코어링 엔진 (8요소). 기준 미만은 등록하지 않는다.
        // 도매 API 는 판매량·리뷰를 주지 않으므로 생략(중립 처리) → 마진·트렌드 등으로 평가.
        const { score, breakdown } = scoreProduct({
          marginRate: top.netMarginRate * 100,
          seasonality: season,
          supplierTrust: SUPPLIER_TRUST,
        });
        if (score < REGISTER_THRESHOLD) {
          counts.lowScore++;
          continue;
        }

        const { data: ins, error } = await sb
          .from("products")
          .insert({
            source_id: it.source_id,
            source_name: it.title,
            category: it.category ?? kw,
            supply_price: it.price,
            shipping_fee: shipping,
            suggested_price: pricing.recommendedSalePrice,
            normal_price: pricing.normalPrice,
            expected_profit: top.netProfit,
            margin_rate: Math.round(top.netMarginRate * 10000) / 100,
            stock_qty: it.stock,
            thumbnail_url: it.thumbnail,
            ai_score: score,
            score_breakdown: breakdown as never,
            supplier: SUPPLIER,
            supplier_trust: SUPPLIER_TRUST,
            status: "pending",
          })
          .select("id")
          .single();
        if (error || !ins) {
          counts.skipped++;
          continue;
        }
        counts.inserted++;
        insertedIds.push({
          id: ins.id,
          name: it.title,
          category: it.category ?? kw,
          price: it.price,
          stock: it.stock,
        });
      }
    }

    // 적재된 상품 AI 보강 평가 (위험도/추천 사유). 점수(ai_score)는 결정론적 스코어를
    // 유지하고, AI 결과는 ai_evaluation/trademark_risk 로만 보강한다. 실패해도 소싱은 성공.
    for (const p of insertedIds) {
      try {
        const ev = await evaluateProduct({
          data: {
            sourceName: p.name,
            category: p.category ?? undefined,
            supplyPrice: p.price,
            marginRate: targetNetMargin * 100,
            stockQty: p.stock,
          },
        });
        await sb
          .from("products")
          .update({
            trademark_risk: ev.trademark_risk as never,
            risk_reason: ev.risk_reason,
            ai_evaluation: ev as never,
          })
          .eq("id", p.id);
        counts.evaluated++;
      } catch {
        // 평가 실패는 무시 (결정론적 점수는 이미 저장됨)
      }
    }

    await sb.from("activity_log").insert({
      action: "products_sourced",
      target_type: "product",
      message: `[소싱] ${REGISTER_THRESHOLD}점↑ 후보 ${counts.inserted}개 등록 (검색 ${counts.found} · 저점탈락 ${counts.lowScore} · AI보강 ${counts.evaluated})`,
      metadata: counts as never,
    });

    return counts;
  });
