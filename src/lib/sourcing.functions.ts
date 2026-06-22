import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { evaluateProductDetail } from "./ai.functions";
import { calcPricing, type Platform } from "./pricing";

// 도매 소싱은 판매량·리뷰가 없으므로, AI 가 "상세페이지/제품 상태/품질" 을 평가한 점수로 거른다.
const QUALITY_THRESHOLD = 60; // AI 품질점수 60↑ 만 추천 등록
const MAX_EVAL = 6; // Vercel 함수 시간제한(60s) 안에서 끝내기 위한 1회 상세분석 상한

type DomeItem = {
  source_id: string;
  title: string;
  price: number;
  shipping: number;
  thumbnail: string | null;
  category: string | null;
};

type DomeDetail = {
  status: string | null;
  inventory: number;
  descText: string;
  manufacturer: string | null;
  country: string | null;
  safetyCert: string | null;
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

/** 도매꾹 오픈API getItemList — 키워드로 상품 목록(제목·가격·썸네일·배송비)을 가져온다. */
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
    const shipping = Number((pick(b, "fee") ?? "0").replace(/[^\d]/g, "")) || 0;
    items.push({
      source_id: no,
      title,
      price,
      shipping,
      thumbnail: pick(b, "thumb") ?? pick(b, "image"),
      category: pick(b, "ctgr") ?? pick(b, "category"),
    });
  }
  return items;
}

/** 도매꾹 오픈API getItemView — 상품 1건의 상세(상태·재고·상세설명·제조사·원산지·인증)를 가져온다. */
async function domeDetail(no: string, apiKey: string): Promise<DomeDetail | null> {
  const url =
    `https://domeggook.com/ssl/api/?ver=4.1&mode=getItemView` +
    `&no=${encodeURIComponent(no)}&aid=${encodeURIComponent(apiKey)}&om=xml`;
  let xml: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    xml = await res.text();
  } catch {
    return null;
  }
  const descRaw = pick(xml, "contents") ?? pick(xml, "desc") ?? "";
  const descText = descRaw
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
  return {
    status: pick(xml, "status"),
    inventory: Number((pick(xml, "inventory") ?? "0").replace(/[^\d]/g, "")) || 0,
    descText,
    manufacturer: pick(xml, "manufacturer"),
    country: pick(xml, "country"),
    safetyCert: pick(xml, "certName") ?? pick(xml, "exemTitle"),
  };
}

/** 상위 트렌드 키워드로 도매꾹에서 후보를 찾고, 각 상품의 상세페이지를 AI 가 평가해
 *  품질 좋은 것만 추천(pending)으로 등록한다. (판매량·리뷰 미사용) */
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

    const { data: trends } = await sb
      .from("trend_keywords")
      .select("keyword, trend_score")
      .order("collected_at", { ascending: false })
      .order("rank", { ascending: true })
      .limit(data.keywordCount);
    const keywords = (trends ?? []).map((t) => t.keyword);
    if (keywords.length === 0) {
      throw new Error("수집된 트렌드 키워드가 없습니다. 먼저 트렌드를 수집하세요.");
    }

    const { data: existing } = await sb
      .from("products")
      .select("source_id")
      .not("source_id", "is", null);
    const seen = new Set((existing ?? []).map((e) => e.source_id));

    const SUPPLIER = "domeme";
    const counts = { found: 0, inserted: 0, evaluated: 0, lowQuality: 0, skipped: 0 };

    for (const kw of keywords) {
      if (counts.evaluated >= MAX_EVAL) break;
      const items = await domeSearch(kw, apiKey, data.perKeyword);
      counts.found += items.length;

      for (const it of items) {
        if (counts.evaluated >= MAX_EVAL) break;
        if (seen.has(it.source_id) || it.price <= 0) {
          counts.skipped++;
          continue;
        }
        seen.add(it.source_id);

        // 1) 상세페이지 가져오기 (제품 상태/설명/제조사/인증/재고)
        const detail = await domeDetail(it.source_id, apiKey);
        if (detail?.status && !detail.status.includes("판매")) {
          counts.skipped++;
          continue; // 판매중이 아닌 상품 제외
        }
        const stock = detail?.inventory ?? 0;

        // 2) 가격/마진/수수료 계산
        const pricing = calcPricing(it.price, it.shipping, [] as Platform[], targetNetMargin);
        const top = pricing.perPlatform.reduce((a, b) => (b.salePrice >= a.salePrice ? b : a));

        // 3) AI 가 상세페이지/제품상태로 품질 평가 (판매량·리뷰 미사용)
        let ev: {
          quality_score: number;
          condition: string;
          trademark_risk: string;
          risk_reason: string;
          recommendation: string;
        };
        try {
          ev = await evaluateProductDetail({
            data: {
              title: it.title,
              category: it.category ?? kw,
              supplyPrice: it.price,
              marginRate: top.netMarginRate * 100,
              descText: detail?.descText,
              manufacturer: detail?.manufacturer ?? undefined,
              country: detail?.country ?? undefined,
              safetyCert: detail?.safetyCert ?? undefined,
            },
          });
        } catch {
          counts.skipped++;
          continue; // AI 평가 실패는 건너뜀
        }
        counts.evaluated++;

        if (ev.quality_score < QUALITY_THRESHOLD) {
          counts.lowQuality++;
          continue;
        }

        const { error } = await sb.from("products").insert({
          source_id: it.source_id,
          source_name: it.title,
          category: it.category ?? kw,
          supply_price: it.price,
          shipping_fee: it.shipping,
          suggested_price: pricing.recommendedSalePrice,
          normal_price: pricing.normalPrice,
          expected_profit: top.netProfit,
          margin_rate: Math.round(top.netMarginRate * 10000) / 100,
          stock_qty: stock,
          thumbnail_url: it.thumbnail,
          description: detail?.descText?.slice(0, 1000) ?? null,
          ai_score: Math.round(ev.quality_score),
          trademark_risk: ev.trademark_risk as never,
          risk_reason: ev.risk_reason,
          ai_evaluation: ev as never,
          supplier: SUPPLIER,
          supplier_trust: 65,
          status: "pending",
        });
        if (error) {
          counts.skipped++;
          continue;
        }
        counts.inserted++;
      }
    }

    await sb.from("activity_log").insert({
      action: "products_sourced",
      target_type: "product",
      message: `[소싱] AI품질 ${QUALITY_THRESHOLD}점↑ 후보 ${counts.inserted}개 등록 (검색 ${counts.found} · 상세분석 ${counts.evaluated} · 저품질탈락 ${counts.lowQuality})`,
      metadata: counts as never,
    });

    return counts;
  });
